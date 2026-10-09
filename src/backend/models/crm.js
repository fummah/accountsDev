const db = require('./dbmgr');
const { QUOTE_STATUS } = require('../services/documentStatus');
// Converting a lead WRITES INTO `customers`, so it must obey the same
// "First Name OR Company Name" rule and the same display-name derivation as
// every other customer-writing path. Without this the conversion had its own
// private rule and could fabricate a name.
const ContactIdentity = require('../services/contactIdentity');
const { customerNameSql } = require('../services/contactIdentity');

const STAGES = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];

// Two DISTINCT customer relationships on a lead:
//   • customer_id            — the lead is LINKED to an existing customer
//   • converted_customer_id  — the lead has been CONVERTED into that customer
// They are joined separately so a linked-but-not-converted lead still shows
// its customer without looking like it was converted.
const LEAD_SELECT = `
  SELECT l.*,
         ${customerNameSql('c')}  AS customer_name,
         ${customerNameSql('lc')} AS linked_customer_name,
         lc.email        AS linked_customer_email,
         lc.company_name AS linked_customer_company
  FROM crm_leads l
  LEFT JOIN customers c  ON l.converted_customer_id = c.id
  LEFT JOIN customers lc ON l.customer_id = lc.id
`;

const CRM = {
  createTables: () => {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS crm_leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        company TEXT,
        email TEXT,
        phone TEXT,
        website TEXT,
        address TEXT,
        status TEXT DEFAULT 'new',
        pipeline_stage TEXT DEFAULT 'new',
        source TEXT,
        owner TEXT,
        assigned_to TEXT,
        value REAL DEFAULT 0,
        priority TEXT DEFAULT 'medium',
        score INTEGER DEFAULT 0,
        tags TEXT,
        notes TEXT,
        lost_reason TEXT,
        expected_close_date TEXT,
        converted_customer_id INTEGER,
        converted_at DATETIME,
        customer_id INTEGER,
        first_name TEXT,
        last_name TEXT,
        display_name TEXT,
        phone_number TEXT,
        mobile_number TEXT,
        address1 TEXT,
        address2 TEXT,
        city TEXT,
        state TEXT,
        postal_code TEXT,
        country TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME
      )
    `).run();
    db.prepare(`
      CREATE TABLE IF NOT EXISTS crm_activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        leadId INTEGER,
        customerId INTEGER,
        type TEXT,
        subject TEXT,
        details TEXT,
        outcome TEXT,
        dueDate DATETIME,
        completedAt DATETIME,
        status TEXT DEFAULT 'open',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME
      )
    `).run();

    // Safe migrations for existing installs
    const leadCols = db.prepare('PRAGMA table_info(crm_leads)').all().map(r => r.name);
    const actCols  = db.prepare('PRAGMA table_info(crm_activities)').all().map(r => r.name);
    const addLeadCol = (col, def) => { if (!leadCols.includes(col)) { try { db.prepare(`ALTER TABLE crm_leads ADD COLUMN ${col} ${def}`).run(); } catch (_) {} } };
    const addActCol  = (col, def) => { if (!actCols.includes(col))  { try { db.prepare(`ALTER TABLE crm_activities ADD COLUMN ${col} ${def}`).run(); } catch (_) {} } };

    addLeadCol('website',              'TEXT');
    addLeadCol('address',              'TEXT');
    addLeadCol('pipeline_stage',       "TEXT DEFAULT 'new'");
    addLeadCol('assigned_to',          'TEXT');
    addLeadCol('value',                'REAL DEFAULT 0');
    addLeadCol('priority',             "TEXT DEFAULT 'medium'");
    addLeadCol('score',                'INTEGER DEFAULT 0');
    addLeadCol('tags',                 'TEXT');
    addLeadCol('lost_reason',          'TEXT');
    addLeadCol('expected_close_date',  'TEXT');
    addLeadCol('converted_customer_id','INTEGER');
    addLeadCol('converted_at',         'DATETIME');
    addActCol('outcome',               'TEXT');
    addActCol('completedAt',           'DATETIME');
    addLeadCol('quote_ids',            'TEXT');

    // ── Link to an EXISTING customer + full customer/contact fields ──────────
    // `customer_id` is the "this lead is linked to an existing customer" link.
    // It is deliberately SEPARATE from `converted_customer_id`, which means
    // "this lead has been converted into that customer" and drives the
    // pipeline (won) + quote creation. Overloading one column for both would
    // make a linked lead look already-converted.
    //
    // The contact columns mirror the `customers` table names exactly so the
    // shared CustomerContactFields component can drive both forms and so a
    // later conversion can copy them across without a mapping table.
    addLeadCol('customer_id',          'INTEGER');
    addLeadCol('first_name',           'TEXT');
    addLeadCol('last_name',            'TEXT');
    addLeadCol('display_name',         'TEXT');
    addLeadCol('phone_number',         'TEXT');
    addLeadCol('mobile_number',        'TEXT');
    addLeadCol('address1',             'TEXT');
    addLeadCol('address2',             'TEXT');
    addLeadCol('city',                 'TEXT');
    addLeadCol('state',                'TEXT');
    addLeadCol('postal_code',          'TEXT');
    addLeadCol('country',              'TEXT');
  },

  // ── Leads ──────────────────────────────────────────────────────────────────
  listLeads: (filters = {}) => {
    let sql = `${LEAD_SELECT} WHERE 1=1`;
    const params = [];
    if (filters.stage)    { sql += ` AND l.pipeline_stage = ?`; params.push(filters.stage); }
    if (filters.source)   { sql += ` AND l.source = ?`;         params.push(filters.source); }
    if (filters.priority) { sql += ` AND l.priority = ?`;       params.push(filters.priority); }
    if (filters.assigned_to) { sql += ` AND l.assigned_to = ?`; params.push(filters.assigned_to); }
    if (filters.customer_id) { sql += ` AND l.customer_id = ?`; params.push(Number(filters.customer_id)); }
    if (filters.search)   {
      sql += ` AND (l.name LIKE ? OR l.company LIKE ? OR l.email LIKE ?
                    OR l.display_name LIKE ? OR l.mobile_number LIKE ? OR l.phone LIKE ?)`;
      const s = `%${filters.search}%`;
      params.push(s, s, s, s, s, s);
    }
    sql += ` ORDER BY l.createdAt DESC`;
    return db.prepare(sql).all(...params);
  },

  /** Every lead linked to a given customer (for the Customer → Leads view). */
  listLeadsByCustomer: (customerId) => {
    if (customerId == null || customerId === '') return [];
    return db.prepare(`${LEAD_SELECT} WHERE l.customer_id = ? ORDER BY l.createdAt DESC`).all(Number(customerId));
  },

  getLead: (id) => db.prepare(`${LEAD_SELECT} WHERE l.id = ?`).get(id),

  createLead: (lead) => {
    const n = CRM._normalizeLeadFields(lead);
    const score = CRM._calcScore(n);
    const stmt = db.prepare(`
      INSERT INTO crm_leads
        (name,company,email,phone,phone_number,website,address,pipeline_stage,source,owner,assigned_to,value,priority,score,tags,notes,expected_close_date,
         customer_id,first_name,last_name,display_name,mobile_number,address1,address2,city,state,postal_code,country,createdAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    `);
    const r = stmt.run(
      n.name, n.company, n.email, n.phone, n.phone_number, n.website, n.address,
      n.pipeline_stage, n.source, n.owner, n.assigned_to, n.value, n.priority,
      score, n.tags, n.notes, n.expected_close_date,
      n.customer_id, n.first_name, n.last_name, n.display_name, n.mobile_number,
      n.address1, n.address2, n.city, n.state, n.postal_code, n.country
    );
    return { success: true, id: r.lastInsertRowid };
  },

  updateLead: (lead) => {
    const n = CRM._normalizeLeadFields(lead);
    // A partial update that omits customer_id must not silently unlink the
    // lead — only an explicit value (including an explicit null) changes it.
    if (!Object.prototype.hasOwnProperty.call(lead, 'customer_id')) {
      const cur = db.prepare('SELECT customer_id FROM crm_leads WHERE id = ?').get(lead.id);
      n.customer_id = cur ? cur.customer_id : null;
    }
    const score = CRM._calcScore(n);
    const stmt = db.prepare(`
      UPDATE crm_leads SET
        name=?,company=?,email=?,phone=?,website=?,address=?,
        pipeline_stage=?,source=?,owner=?,assigned_to=?,value=?,
        priority=?,score=?,tags=?,notes=?,lost_reason=?,expected_close_date=?,
        customer_id=?,first_name=?,last_name=?,display_name=?,phone_number=?,mobile_number=?,
        address1=?,address2=?,city=?,state=?,postal_code=?,country=?,
        updatedAt=datetime('now')
      WHERE id=?
    `);
    stmt.run(
      n.name, n.company, n.email, n.phone, n.website, n.address,
      n.pipeline_stage, n.source, n.owner, n.assigned_to, n.value, n.priority,
      score, n.tags, n.notes, n.lost_reason, n.expected_close_date,
      n.customer_id, n.first_name, n.last_name, n.display_name, n.phone_number, n.mobile_number,
      n.address1, n.address2, n.city, n.state, n.postal_code, n.country,
      lead.id
    );
    return { success: true };
  },

  updateLeadStage: (id, stage) => {
    const extra = stage === 'won' ? `, status='won'` : stage === 'lost' ? `, status='lost'` : '';
    db.prepare(`UPDATE crm_leads SET pipeline_stage=?${extra}, updatedAt=datetime('now') WHERE id=?`).run(stage, id);
    return { success: true };
  },

  bulkUpdateStage: (ids, stage) => {
    const update = db.prepare(`UPDATE crm_leads SET pipeline_stage=?, updatedAt=datetime('now') WHERE id=?`);
    const run = db.transaction((idList) => { idList.forEach(id => update.run(stage, id)); });
    run(ids);
    return { success: true };
  },

  deleteLead: (id) => {
    const run = db.transaction(() => {
      db.prepare(`DELETE FROM crm_activities WHERE leadId = ?`).run(id);
      db.prepare(`DELETE FROM crm_leads WHERE id = ?`).run(id);
    });
    try { run(); return { success: true }; }
    catch (e) { return { success: false, error: e.message }; }
  },

  convertToCustomer: (id, extraData = {}) => {
    const lead = db.prepare(`SELECT * FROM crm_leads WHERE id = ?`).get(id);
    if (!lead) return { success: false, error: 'Lead not found' };
    if (lead.converted_customer_id) return { success: false, error: 'Already converted' };

    const n = CRM._normalizeLeadFields(lead);
    // A lead that was created against an EXISTING customer already HAS a
    // customer — converting it must link to that record, never create a
    // second, duplicate customer.
    const existingLink = lead.customer_id
      ? db.prepare('SELECT id FROM customers WHERE id = ?').get(Number(lead.customer_id))
      : null;

    const run = db.transaction(() => {
      let custId;
      if (existingLink) {
        custId = existingLink.id;
      } else {
        const companyName = n.company || '';
        let firstName = n.first_name || '';
        let lastName  = n.last_name != null ? n.last_name : '';
        // A legacy lead may carry only the single `name` field. Split it into a
        // person ONLY when the lead has no company: for a company-only lead the
        // `name` IS the company (see _normalizeLeadFields), so splitting it
        // would invent a person called "Amazon" and store a blank company.
        if (!firstName && !companyName) {
          const parts = String(n.name || '').trim().split(/\s+/).filter(Boolean);
          firstName = parts[0] || '';
          lastName  = lastName || parts.slice(1).join(' ');
        }
        // Same rule as the customer form and the customers model — the API must
        // not create a customer that is neither a person nor a business.
        ContactIdentity.assertIdentified({ first_name: firstName, company_name: companyName });
        // Same display-name priority: explicit -> personal name -> company.
        const displayName = ContactIdentity.deriveDisplayName({
          display_name: extraData.display_name || n.display_name,
          first_name: firstName,
          last_name: lastName,
          company_name: companyName,
        });
        const r = db.prepare(`
          INSERT INTO customers
            (title,first_name,last_name,display_name,email,phone_number,mobile_number,company_name,
             address1,address2,city,state,postal_code,country,notes)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(
          '', firstName, lastName, displayName,
          n.email || '', n.phone_number || n.phone || '', n.mobile_number || n.phone || '',
          companyName, n.address1 || n.address || '',
          n.address2 || '', n.city || '', n.state || '', n.postal_code || '', n.country || '',
          n.notes || ''
        );
        custId = r.lastInsertRowid;
      }
      db.prepare(`UPDATE crm_leads SET converted_customer_id=?, converted_at=datetime('now'), pipeline_stage='won', status='won', updatedAt=datetime('now') WHERE id=?`).run(custId, id);
      return custId;
    });
    try {
      const customerId = run();
      return { success: true, customerId, reusedExistingCustomer: !!existingLink };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  // ── Activities ─────────────────────────────────────────────────────────────
  listActivities: (params = {}) => {
    let sql = `SELECT * FROM crm_activities WHERE 1=1`;
    const p = [];
    if (params.leadId)     { sql += ` AND leadId = ?`;     p.push(params.leadId); }
    if (params.customerId) { sql += ` AND customerId = ?`; p.push(params.customerId); }
    if (params.status)     { sql += ` AND status = ?`;     p.push(params.status); }
    sql += ` ORDER BY COALESCE(dueDate, createdAt) ASC`;
    return db.prepare(sql).all(...p);
  },

  getOverdueActivities: () => {
    return db.prepare(`
      SELECT a.*, l.name AS lead_name, l.company AS lead_company
      FROM crm_activities a LEFT JOIN crm_leads l ON a.leadId = l.id
      WHERE a.status = 'open' AND a.dueDate < datetime('now')
      ORDER BY a.dueDate ASC
    `).all();
  },

  getUpcomingActivities: (days = 7) => {
    return db.prepare(`
      SELECT a.*, l.name AS lead_name, l.company AS lead_company
      FROM crm_activities a LEFT JOIN crm_leads l ON a.leadId = l.id
      WHERE a.status = 'open' AND a.dueDate BETWEEN datetime('now') AND datetime('now','+${days} days')
      ORDER BY a.dueDate ASC
    `).all();
  },

  createActivity: (activity) => {
    const stmt = db.prepare(`
      INSERT INTO crm_activities (leadId,customerId,type,subject,details,outcome,dueDate,status,createdAt)
      VALUES (?,?,?,?,?,?,?,?,datetime('now'))
    `);
    const r = stmt.run(
      activity.leadId||null, activity.customerId||null,
      activity.type||null, activity.subject||null,
      activity.details||null, activity.outcome||null,
      activity.dueDate||null, activity.status||'open'
    );
    return { success: true, id: r.lastInsertRowid };
  },

  updateActivity: (activity) => {
    const completedAt = activity.status === 'done' ? `datetime('now')` : 'NULL';
    db.prepare(`
      UPDATE crm_activities SET leadId=?,customerId=?,type=?,subject=?,details=?,outcome=?,dueDate=?,status=?,
      completedAt=CASE WHEN ? = 'done' THEN datetime('now') ELSE completedAt END,updatedAt=datetime('now') WHERE id=?
    `).run(
      activity.leadId||null, activity.customerId||null,
      activity.type||null, activity.subject||null,
      activity.details||null, activity.outcome||null,
      activity.dueDate||null, activity.status||'open',
      activity.status||'open', activity.id
    );
    return { success: true };
  },

  deleteActivity: (id) => {
    db.prepare(`DELETE FROM crm_activities WHERE id = ?`).run(id);
    return { success: true };
  },

  // ── Reports & Stats ────────────────────────────────────────────────────────
  getPipelineStats: () => {
    const stages = db.prepare(`
      SELECT pipeline_stage AS stage, COUNT(*) AS count, COALESCE(SUM(value),0) AS total_value
      FROM crm_leads GROUP BY pipeline_stage
    `).all();
    const total = db.prepare(`SELECT COUNT(*) AS c, COALESCE(SUM(value),0) AS v FROM crm_leads`).get();
    const won   = db.prepare(`SELECT COUNT(*) AS c, COALESCE(SUM(value),0) AS v FROM crm_leads WHERE pipeline_stage='won'`).get();
    const lost  = db.prepare(`SELECT COUNT(*) AS c FROM crm_leads WHERE pipeline_stage='lost'`).get();
    const convRate = total.c > 0 ? Math.round((won.c / total.c) * 100) : 0;
    return { stages, total: total.c, totalValue: total.v, won: won.c, wonValue: won.v, lost: lost.c, conversionRate: convRate };
  },

  getReports: () => {
    const bySource   = db.prepare(`SELECT source, COUNT(*) AS count, COALESCE(SUM(value),0) AS value FROM crm_leads WHERE source IS NOT NULL GROUP BY source ORDER BY count DESC`).all();
    const byStage    = db.prepare(`SELECT pipeline_stage AS stage, COUNT(*) AS count, COALESCE(SUM(value),0) AS value FROM crm_leads GROUP BY pipeline_stage`).all();
    const byPriority = db.prepare(`SELECT priority, COUNT(*) AS count FROM crm_leads GROUP BY priority`).all();
    const monthly    = db.prepare(`SELECT strftime('%Y-%m', createdAt) AS month, COUNT(*) AS created, SUM(CASE WHEN pipeline_stage='won' THEN 1 ELSE 0 END) AS won FROM crm_leads GROUP BY month ORDER BY month DESC LIMIT 12`).all();
    const actTypes   = db.prepare(`SELECT type, COUNT(*) AS count FROM crm_activities GROUP BY type`).all();
    const topOwners  = db.prepare(`SELECT COALESCE(assigned_to, owner, 'Unassigned') AS owner, COUNT(*) AS leads, SUM(CASE WHEN pipeline_stage='won' THEN 1 ELSE 0 END) AS won FROM crm_leads GROUP BY owner ORDER BY leads DESC LIMIT 10`).all();
    const avgDays    = db.prepare(`SELECT AVG(CAST((julianday(converted_at) - julianday(createdAt)) AS REAL)) AS avg_days FROM crm_leads WHERE converted_at IS NOT NULL`).get();
    return { bySource, byStage, byPriority, monthly, actTypes, topOwners, avgDaysToClose: Math.round(avgDays?.avg_days || 0) };
  },

  // ── Quote linkage ──────────────────────────────────────────────────────────
  getLeadQuotes: (leadId) => {
    const lead = db.prepare(`SELECT quote_ids FROM crm_leads WHERE id = ?`).get(leadId);
    if (!lead) return [];
    let ids = [];
    try { ids = JSON.parse(lead.quote_ids || '[]'); } catch { ids = []; }
    if (!ids.length) return [];
    const placeholders = ids.map(() => '?').join(',');
    return db.prepare(`
      SELECT q.id, q.number, q.status, q.start_date, q.last_date, q.customer_email,
             COALESCE(SUM(ql.amount), 0) AS amount, q.vat,
             ${customerNameSql('c')} AS customer_name, q.lead_id
      FROM quotes q
      LEFT JOIN quote_lines ql ON ql.quote_id = q.id
      LEFT JOIN customers c ON q.customer = c.id
      WHERE q.id IN (${placeholders})
      GROUP BY q.id ORDER BY q.id DESC
    `).all(...ids);
  },

  linkQuote: (leadId, quoteId) => {
    const lead = db.prepare(`SELECT quote_ids FROM crm_leads WHERE id = ?`).get(leadId);
    if (!lead) return { success: false, error: 'Lead not found' };
    let ids = [];
    try { ids = JSON.parse(lead.quote_ids || '[]'); } catch { ids = []; }
    if (!ids.includes(quoteId)) {
      ids.push(quoteId);
      db.prepare(`UPDATE crm_leads SET quote_ids=?, updatedAt=datetime('now') WHERE id=?`).run(JSON.stringify(ids), leadId);
    }
    return { success: true };
  },

  // Create a quote for a lead, reusing the lead's EXISTING customer link.
  //
  // ROOT-CAUSE FIX: this used to read ONLY `converted_customer_id` and, when
  // that was empty, AUTO-CREATE a brand-new customer. A lead that was linked to
  // an existing customer (`customer_id`) therefore produced a SECOND, duplicate
  // customer for the quote (Customer A → Lead, Customer B → Quote). It now
  // resolves the customer from converted_customer_id → customer_id (→ an
  // explicit override) and NEVER fabricates a customer. A lead with no customer
  // link is rejected with `requiresCustomer` so the UI can ask for one.
  createQuoteForLead: (leadId, quoteData = {}, quoteLines) => {
    const lead = db.prepare(`SELECT * FROM crm_leads WHERE id = ?`).get(leadId);
    if (!lead) return { success: false, error: 'Lead not found' };

    // A caller may pass an explicit customer_id (the legacy-lead "select a
    // customer" prompt). That wins, then the converted link, then the link.
    const requestedId = quoteData.customer_id != null && quoteData.customer_id !== ''
      ? Number(quoteData.customer_id) : null;
    const linkId = requestedId || lead.converted_customer_id || lead.customer_id || null;

    const run = db.transaction(() => {
      let customerId = null;
      if (linkId) {
        const cust = db.prepare('SELECT id FROM customers WHERE id = ?').get(Number(linkId));
        if (cust) customerId = cust.id;
      }
      if (!customerId) {
        throw Object.assign(new Error('NO_CUSTOMER'), { code: 'NO_CUSTOMER' });
      }

      // A newly-supplied customer (legacy lead) is saved back onto the lead so
      // the relationship is stable for every later action.
      if (requestedId && Number(requestedId) === customerId && !lead.customer_id) {
        db.prepare(`UPDATE crm_leads SET customer_id=?, updatedAt=datetime('now') WHERE id=?`).run(customerId, leadId);
      }

      // Create the quote. Status is intentionally NOT taken from the caller:
      // a quote created from a lead starts in the active workflow state
      // (Pending), exactly like the standard Create Quote screen. It only moves
      // on through acceptQuote / declineQuote / convertQuoteToInvoice.
      const qResult = db.prepare(`
        INSERT INTO quotes (status,customer,customer_email,islater,billing_address,start_date,last_date,message,statement_message,number,entered_by,vat,lead_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        QUOTE_STATUS.PENDING,
        customerId,
        quoteData.customer_email || lead.email || '',
        0,
        quoteData.billing_address || lead.address || '',
        quoteData.start_date || new Date().toISOString().slice(0,10),
        quoteData.last_date || '',
        quoteData.message || '',
        quoteData.statement_message || '',
        '',
        quoteData.entered_by || 'CRM',
        Number(quoteData.vat || 0),
        Number(leadId)
      );
      const quoteId = qResult.lastInsertRowid;

      // Insert line items. The renderer sends `product_id`; `product` is only
      // the legacy alias, so accept either (mirrors quotes.insertQuote).
      const lines = Array.isArray(quoteLines) ? quoteLines : [];
      const lineStmt = db.prepare(`INSERT INTO quote_lines (quote_id,product,description,quantity,rate,amount) VALUES (?,?,?,?,?,?)`);
      for (const l of lines) {
        lineStmt.run(quoteId, l.product_id || l.product || 0, l.description||'', Number(l.quantity)||1, Number(l.rate)||0, Number(l.amount)||0);
      }

      // Auto-generate quote number
      const formattedNumber = `QUO-${String(quoteId).padStart(5,'0')}`;
      db.prepare(`UPDATE quotes SET number=? WHERE id=?`).run(formattedNumber, quoteId);

      // Link quote to lead (JSON list, kept for backwards compatibility).
      let ids = [];
      try { ids = JSON.parse(lead.quote_ids || '[]'); } catch { ids = []; }
      ids.push(quoteId);
      db.prepare(`UPDATE crm_leads SET quote_ids=?, pipeline_stage=CASE WHEN pipeline_stage IN ('new','contacted','qualified') THEN 'proposal' ELSE pipeline_stage END, updatedAt=datetime('now') WHERE id=?`).run(JSON.stringify(ids), leadId);

      // Log activity
      db.prepare(`INSERT INTO crm_activities (leadId,type,subject,details,status,createdAt) VALUES (?,?,?,?,?,datetime('now'))`)
        .run(leadId, 'note', `Quote ${formattedNumber} created`, `Quote created for customer #${customerId} — Amount: R${lines.reduce((s,l)=>s+(l.amount||0),0).toFixed(2)}`, 'done');

      return { success: true, quoteId: Number(quoteId), quoteNumber: formattedNumber, customerId, leadId: Number(leadId), status: QUOTE_STATUS.PENDING };
    });

    try { return run(); }
    catch (e) {
      if (e && e.code === 'NO_CUSTOMER') {
        return {
          success: false,
          requiresCustomer: true,
          error: 'This Lead is not linked to a Customer. Select or create a Customer before creating the Quote.',
        };
      }
      return { success: false, error: e.message };
    }
  },

  /**
   * AUDIT ONLY (no mutation): find likely-duplicate customers created by the
   * old quote-from-lead bug — same normalised name/company/email split across
   * records where one holds leads and another holds quotes. Never merges.
   */
  auditDuplicateCustomers: () => {
    const keyOf = (r) => {
      const name = String(r.name || '').trim().toLowerCase();
      const company = String(r.company || '').trim().toLowerCase();
      const email = String(r.email || '').trim().toLowerCase();
      return `${name}|${company}|${email}`;
    };
    const rows = db.prepare(`
      SELECT c.id,
             ${customerNameSql('c')} AS name,
             c.company_name AS company,
             c.email,
             (SELECT COUNT(*) FROM crm_leads l WHERE l.customer_id = c.id OR l.converted_customer_id = c.id) AS lead_count,
             (SELECT COUNT(*) FROM quotes q WHERE q.customer = c.id) AS quote_count
      FROM customers c
    `).all();

    const groups = new Map();
    for (const r of rows) {
      const k = keyOf(r);
      if (!k.replace(/\|/g, '')) continue; // nothing to key on
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }
    const candidates = [];
    for (const [, list] of groups) {
      if (list.length < 2) continue;
      // Only interesting when the duplicate set straddles leads and quotes.
      const totalLeads = list.reduce((s, r) => s + r.lead_count, 0);
      const totalQuotes = list.reduce((s, r) => s + r.quote_count, 0);
      if (totalLeads > 0 && totalQuotes > 0) {
        candidates.push({ name: list[0].name || list[0].company || `Customer #${list[0].id}`, customers: list.map(r => ({ id: r.id, name: r.name, company: r.company, email: r.email, leads: r.lead_count, quotes: r.quote_count })) });
      }
    }
    return candidates;
  },

  getLeadWithRelated: (leadId) => {
    const lead = db.prepare(`${LEAD_SELECT} WHERE l.id = ?`).get(leadId);
    if (!lead) return null;
    // Backwards-compatible alias that older callers still read.
    try {
      lead.customer_email_linked = lead.converted_customer_id
        ? ((db.prepare('SELECT email FROM customers WHERE id = ?').get(Number(lead.converted_customer_id)) || {}).email || null)
        : null;
    } catch { lead.customer_email_linked = null; }
    lead.quotes     = CRM.getLeadQuotes(leadId);
    lead.activities = db.prepare(`SELECT * FROM crm_activities WHERE leadId=? ORDER BY COALESCE(dueDate,createdAt) ASC`).all(leadId);
    return lead;
  },

  // ── Internal helpers ───────────────────────────────────────────────────────
  /**
   * Normalise an incoming lead payload into the exact column set the table
   * stores, deriving the legacy single-value columns so that every existing
   * query (list search, lead score, drawer, conversion) keeps working.
   */
  _normalizeLeadFields: (lead = {}) => {
    const s = (v) => (v == null ? '' : String(v).trim());

    const first_name   = s(lead.first_name);
    const last_name    = s(lead.last_name);
    const display_name = s(lead.display_name);
    const company_name = s(lead.company_name);
    const company      = company_name || s(lead.company);

    // `name` is NOT NULL and is what search / the drawer / conversion use.
    // Derive it the same way the Customer form derives a display name:
    // display name → "First Last" → company → previous name → placeholder.
    const name = display_name
      || `${first_name} ${last_name}`.trim()
      || company
      || s(lead.name)
      || 'Unnamed Lead';

    // Keep the legacy single-line `address` meaningful. If any structured
    // part is present, recompose it so editing address1/… updates `address`;
    // otherwise preserve whatever single-line address was stored before.
    const parts = [lead.address1, lead.address2, lead.city, lead.state, lead.postal_code, lead.country].map(s);
    const address = parts.some(Boolean) ? parts.filter(Boolean).join(', ') : s(lead.address);

    const phone_number = s(lead.phone_number);
    const phone = phone_number || s(lead.phone);

    const tags = Array.isArray(lead.tags)
      ? (lead.tags.length ? JSON.stringify(lead.tags) : null)
      : (s(lead.tags) || null);

    return {
      name,
      first_name:   first_name || null,
      last_name:    last_name || null,
      display_name: display_name || null,
      company_name,
      company:      company || null,
      email:        s(lead.email) || null,
      phone_number: phone_number || null,
      mobile_number: s(lead.mobile_number) || null,
      phone:        phone || null,
      website:      s(lead.website) || null,
      address:      address || null,
      address1:     s(lead.address1) || null,
      address2:     s(lead.address2) || null,
      city:         s(lead.city) || null,
      state:        s(lead.state) || null,
      postal_code:  s(lead.postal_code) || null,
      country:      s(lead.country) || null,
      customer_id:  (lead.customer_id == null || lead.customer_id === '') ? null : Number(lead.customer_id),
      pipeline_stage: lead.pipeline_stage || 'new',
      source:       lead.source || null,
      owner:        lead.owner || null,
      assigned_to:  lead.assigned_to || null,
      value:        Number(lead.value || 0),
      priority:     lead.priority || 'medium',
      tags,
      notes:        lead.notes || null,
      lost_reason:  lead.lost_reason || null,
      expected_close_date: lead.expected_close_date || null,
    };
  },

  _calcScore: (lead) => {
    let s = 0;
    if (lead.email)               s += 20;
    if (lead.phone)               s += 15;
    if (lead.company)             s += 10;
    if (lead.value > 0)           s += 20;
    if (lead.expected_close_date) s += 10;
    if (lead.source)              s += 10;
    if (lead.website)             s += 5;
    if (lead.address)             s += 5;
    const prio = { high: 5, medium: 3, low: 0 };
    s += prio[lead.priority] || 0;
    return Math.min(100, s);
  },
};

CRM.createTables();

module.exports = CRM;


