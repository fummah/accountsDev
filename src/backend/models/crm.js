const db = require('./dbmgr');

const STAGES = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];

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
  },

  // ── Leads ──────────────────────────────────────────────────────────────────
  listLeads: (filters = {}) => {
    let sql = `SELECT l.*, c.first_name||' '||c.last_name AS customer_name
               FROM crm_leads l
               LEFT JOIN customers c ON l.converted_customer_id = c.id
               WHERE 1=1`;
    const params = [];
    if (filters.stage)    { sql += ` AND l.pipeline_stage = ?`; params.push(filters.stage); }
    if (filters.source)   { sql += ` AND l.source = ?`;         params.push(filters.source); }
    if (filters.priority) { sql += ` AND l.priority = ?`;       params.push(filters.priority); }
    if (filters.assigned_to) { sql += ` AND l.assigned_to = ?`; params.push(filters.assigned_to); }
    if (filters.search)   { sql += ` AND (l.name LIKE ? OR l.company LIKE ? OR l.email LIKE ?)`; const s = `%${filters.search}%`; params.push(s, s, s); }
    sql += ` ORDER BY l.createdAt DESC`;
    return db.prepare(sql).all(...params);
  },

  getLead: (id) => {
    return db.prepare(`SELECT l.*, c.first_name||' '||c.last_name AS customer_name
                       FROM crm_leads l LEFT JOIN customers c ON l.converted_customer_id = c.id
                       WHERE l.id = ?`).get(id);
  },

  createLead: (lead) => {
    const score = CRM._calcScore(lead);
    const stmt = db.prepare(`
      INSERT INTO crm_leads
        (name,company,email,phone,website,address,pipeline_stage,source,owner,assigned_to,value,priority,score,tags,notes,expected_close_date,createdAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    `);
    const r = stmt.run(
      lead.name, lead.company||null, lead.email||null, lead.phone||null,
      lead.website||null, lead.address||null,
      lead.pipeline_stage||'new', lead.source||null, lead.owner||null,
      lead.assigned_to||null, Number(lead.value||0), lead.priority||'medium',
      score, lead.tags ? JSON.stringify(lead.tags) : null,
      lead.notes||null, lead.expected_close_date||null
    );
    return { success: true, id: r.lastInsertRowid };
  },

  updateLead: (lead) => {
    const score = CRM._calcScore(lead);
    const stmt = db.prepare(`
      UPDATE crm_leads SET
        name=?,company=?,email=?,phone=?,website=?,address=?,
        pipeline_stage=?,source=?,owner=?,assigned_to=?,value=?,
        priority=?,score=?,tags=?,notes=?,lost_reason=?,expected_close_date=?,
        updatedAt=datetime('now')
      WHERE id=?
    `);
    stmt.run(
      lead.name, lead.company||null, lead.email||null, lead.phone||null,
      lead.website||null, lead.address||null,
      lead.pipeline_stage||'new', lead.source||null, lead.owner||null,
      lead.assigned_to||null, Number(lead.value||0), lead.priority||'medium',
      score, lead.tags ? JSON.stringify(lead.tags) : null,
      lead.notes||null, lead.lost_reason||null, lead.expected_close_date||null,
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

    const nameParts = (lead.name || '').trim().split(' ');
    const firstName = nameParts[0] || lead.name;
    const lastName  = nameParts.slice(1).join(' ') || '';

    const custStmt = db.prepare(`
      INSERT INTO customers (title,first_name,last_name,display_name,email,phone_number,mobile_number,company_name,address1)
      VALUES (?,?,?,?,?,?,?,?,?)
    `);
    const run = db.transaction(() => {
      const r = custStmt.run(
        '',
        firstName, lastName,
        extraData.display_name || lead.name || firstName,
        lead.email||'', lead.phone||'', lead.phone||'',
        lead.company||'', lead.address||''
      );
      const custId = r.lastInsertRowid;
      db.prepare(`UPDATE crm_leads SET converted_customer_id=?, converted_at=datetime('now'), pipeline_stage='won', status='won', updatedAt=datetime('now') WHERE id=?`).run(custId, id);
      return custId;
    });
    try {
      const customerId = run();
      return { success: true, customerId };
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
             COALESCE(SUM(ql.amount * ql.quantity), 0) AS amount, q.vat,
             c.first_name||' '||c.last_name AS customer_name
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

  createQuoteForLead: (leadId, quoteData, quoteLines) => {
    const lead = db.prepare(`SELECT * FROM crm_leads WHERE id = ?`).get(leadId);
    if (!lead) return { success: false, error: 'Lead not found' };

    const run = db.transaction(() => {
      let customerId = lead.converted_customer_id;

      // Auto-convert to customer if not yet done
      if (!customerId) {
        const nameParts = (lead.name || '').trim().split(' ');
        const firstName = nameParts[0] || lead.name || 'Unknown';
        const lastName  = nameParts.slice(1).join(' ') || '';
        const r = db.prepare(`
          INSERT INTO customers (title,first_name,last_name,display_name,email,phone_number,mobile_number,company_name,address1)
          VALUES (?,?,?,?,?,?,?,?,?)
        `).run('', firstName, lastName, lead.name || firstName, lead.email||'', lead.phone||'', lead.phone||'', lead.company||'', lead.address||'');
        customerId = r.lastInsertRowid;
        db.prepare(`UPDATE crm_leads SET converted_customer_id=?, converted_at=datetime('now'), pipeline_stage='proposal', updatedAt=datetime('now') WHERE id=?`).run(customerId, leadId);
      }

      // Create the quote
      const qResult = db.prepare(`
        INSERT INTO quotes (status,customer,customer_email,islater,billing_address,start_date,last_date,message,statement_message,number,entered_by,vat)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        quoteData.status || 'Draft',
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
        Number(quoteData.vat || 0)
      );
      const quoteId = qResult.lastInsertRowid;

      // Insert line items
      const lines = Array.isArray(quoteLines) ? quoteLines : [];
      const lineStmt = db.prepare(`INSERT INTO quote_lines (quote_id,product,description,quantity,rate,amount) VALUES (?,?,?,?,?,?)`);
      for (const l of lines) {
        lineStmt.run(quoteId, l.product||0, l.description||'', Number(l.quantity)||1, Number(l.rate)||0, Number(l.amount)||0);
      }

      // Auto-generate quote number
      const formattedNumber = `QUO-${String(quoteId).padStart(5,'0')}`;
      db.prepare(`UPDATE quotes SET number=? WHERE id=?`).run(formattedNumber, quoteId);

      // Link quote to lead
      let ids = [];
      try { ids = JSON.parse(lead.quote_ids || '[]'); } catch { ids = []; }
      ids.push(quoteId);
      db.prepare(`UPDATE crm_leads SET quote_ids=?, pipeline_stage=CASE WHEN pipeline_stage IN ('new','contacted','qualified') THEN 'proposal' ELSE pipeline_stage END, updatedAt=datetime('now') WHERE id=?`).run(JSON.stringify(ids), leadId);

      // Log activity
      db.prepare(`INSERT INTO crm_activities (leadId,type,subject,details,status,createdAt) VALUES (?,?,?,?,?,datetime('now'))`)
        .run(leadId, 'note', `Quote ${formattedNumber} created`, `Quote created for customer #${customerId} — Amount: R${lines.reduce((s,l)=>s+(l.amount*l.quantity),0).toFixed(2)}`, 'done');

      return { success: true, quoteId: Number(quoteId), quoteNumber: formattedNumber, customerId };
    });

    try { return run(); }
    catch (e) { return { success: false, error: e.message }; }
  },

  getLeadWithRelated: (leadId) => {
    const lead = db.prepare(`
      SELECT l.*, c.first_name||' '||c.last_name AS customer_name, c.email AS customer_email_linked
      FROM crm_leads l LEFT JOIN customers c ON l.converted_customer_id = c.id
      WHERE l.id = ?`).get(leadId);
    if (!lead) return null;
    lead.quotes     = CRM.getLeadQuotes(leadId);
    lead.activities = db.prepare(`SELECT * FROM crm_activities WHERE leadId=? ORDER BY COALESCE(dueDate,createdAt) ASC`).all(leadId);
    return lead;
  },

  // ── Internal helpers ───────────────────────────────────────────────────────
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


