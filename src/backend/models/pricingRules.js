const db = require('./dbmgr');

const PricingRules = {
  createTables() {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS customer_price_tiers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        discount_percent REAL DEFAULT 0,
        description TEXT,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS customer_tier_assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        tier_id INTEGER NOT NULL,
        UNIQUE(customer_id),
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        FOREIGN KEY (tier_id) REFERENCES customer_price_tiers(id)
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS pricing_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        rule_type TEXT NOT NULL,
        item_id INTEGER,
        category TEXT,
        tier_id INTEGER,
        customer_id INTEGER,
        min_quantity REAL,
        max_quantity REAL,
        discount_percent REAL DEFAULT 0,
        fixed_price REAL,
        cost_plus_percent REAL,
        start_date DATE,
        end_date DATE,
        priority INTEGER DEFAULT 0,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  },

  // Tiers
  listTiers() {
    return db.prepare(`SELECT * FROM customer_price_tiers ORDER BY name ASC`).all();
  },
  saveTier(tier) {
    if (tier.id) {
      db.prepare(`UPDATE customer_price_tiers SET name=?, discount_percent=?, description=?, active=? WHERE id=?`)
        .run(tier.name, tier.discount_percent || 0, tier.description || '', tier.active !== false ? 1 : 0, tier.id);
      return { success: true, id: tier.id };
    }
    const res = db.prepare(`INSERT INTO customer_price_tiers (name, discount_percent, description, active) VALUES (?,?,?,1)`)
      .run(tier.name, tier.discount_percent || 0, tier.description || '');
    return { success: true, id: res.lastInsertRowid };
  },
  deleteTier(id) {
    db.prepare(`DELETE FROM customer_tier_assignments WHERE tier_id = ?`).run(id);
    return db.prepare(`DELETE FROM customer_price_tiers WHERE id = ?`).run(id);
  },

  // Customer assignments
  assignCustomerTier(customerId, tierId) {
    db.prepare(`INSERT INTO customer_tier_assignments (customer_id, tier_id) VALUES (?, ?) ON CONFLICT(customer_id) DO UPDATE SET tier_id = excluded.tier_id`)
      .run(customerId, tierId);
    return { success: true };
  },
  getCustomerTier(customerId) {
    return db.prepare(`SELECT t.* FROM customer_price_tiers t JOIN customer_tier_assignments a ON a.tier_id = t.id WHERE a.customer_id = ?`).get(customerId);
  },

  // Rules
  listRules() {
    return db.prepare(`SELECT * FROM pricing_rules ORDER BY priority DESC, created_at DESC`).all();
  },
  saveRule(rule) {
    if (rule.id) {
      db.prepare(`UPDATE pricing_rules SET name=?, rule_type=?, item_id=?, category=?, tier_id=?, customer_id=?,
        min_quantity=?, max_quantity=?, discount_percent=?, fixed_price=?, cost_plus_percent=?,
        start_date=?, end_date=?, priority=?, active=? WHERE id=?`)
        .run(rule.name, rule.rule_type, rule.item_id || null, rule.category || null, rule.tier_id || null, rule.customer_id || null,
          rule.min_quantity || null, rule.max_quantity || null, rule.discount_percent || 0, rule.fixed_price || null,
          rule.cost_plus_percent || null, rule.start_date || null, rule.end_date || null, rule.priority || 0,
          rule.active !== false ? 1 : 0, rule.id);
      return { success: true, id: rule.id };
    }
    const res = db.prepare(`INSERT INTO pricing_rules (name, rule_type, item_id, category, tier_id, customer_id,
      min_quantity, max_quantity, discount_percent, fixed_price, cost_plus_percent, start_date, end_date, priority, active)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`)
      .run(rule.name, rule.rule_type, rule.item_id || null, rule.category || null, rule.tier_id || null, rule.customer_id || null,
        rule.min_quantity || null, rule.max_quantity || null, rule.discount_percent || 0, rule.fixed_price || null,
        rule.cost_plus_percent || null, rule.start_date || null, rule.end_date || null, rule.priority || 0);
    return { success: true, id: res.lastInsertRowid };
  },
  deleteRule(id) {
    return db.prepare(`DELETE FROM pricing_rules WHERE id = ?`).run(id);
  },

  // Price calculation engine
  calculatePrice(itemId, quantity, customerId, date) {
    const today = date || new Date().toISOString().slice(0, 10);
    const baseItem = db.prepare(`SELECT price FROM products WHERE id = ?`).get(itemId);
    let basePrice = baseItem ? Number(baseItem.price || 0) : 0;

    // Get customer tier
    const tier = customerId ? this.getCustomerTier(customerId) : null;

    // Get all applicable rules, sorted by priority
    const rules = db.prepare(`
      SELECT * FROM pricing_rules
      WHERE active = 1
        AND (item_id IS NULL OR item_id = ?)
        AND (customer_id IS NULL OR customer_id = ?)
        AND (tier_id IS NULL OR tier_id = ?)
        AND (min_quantity IS NULL OR ? >= min_quantity)
        AND (max_quantity IS NULL OR ? <= max_quantity)
        AND (start_date IS NULL OR start_date <= ?)
        AND (end_date IS NULL OR end_date >= ?)
      ORDER BY priority DESC
      LIMIT 1
    `).get(itemId, customerId || -1, tier ? tier.id : -1, quantity || 1, quantity || 1, today, today);

    if (rules) {
      switch (rules.rule_type) {
        case 'fixed_price':
          return { price: Number(rules.fixed_price || basePrice), rule: rules.name, type: 'fixed' };
        case 'discount':
          const discounted = basePrice * (1 - (Number(rules.discount_percent || 0) / 100));
          return { price: Number(discounted.toFixed(2)), rule: rules.name, type: 'discount', discount: rules.discount_percent };
        case 'cost_plus':
          const costPlus = basePrice * (1 + (Number(rules.cost_plus_percent || 0) / 100));
          return { price: Number(costPlus.toFixed(2)), rule: rules.name, type: 'cost_plus' };
        case 'quantity_break':
          const qtyDisc = basePrice * (1 - (Number(rules.discount_percent || 0) / 100));
          return { price: Number(qtyDisc.toFixed(2)), rule: rules.name, type: 'quantity_break', discount: rules.discount_percent };
      }
    }

    // Apply tier discount if no specific rule matched
    if (tier && tier.discount_percent > 0) {
      const tierPrice = basePrice * (1 - (Number(tier.discount_percent) / 100));
      return { price: Number(tierPrice.toFixed(2)), rule: `Tier: ${tier.name}`, type: 'tier', discount: tier.discount_percent };
    }

    return { price: basePrice, rule: null, type: 'base' };
  }
};

PricingRules.createTables();

module.exports = PricingRules;
