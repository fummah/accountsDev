const db = require('./dbmgr');

const PickPackShip = {
  createTables() {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS sales_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_number TEXT,
        customer_id INTEGER,
        order_date DATE DEFAULT (date('now')),
        expected_ship_date DATE,
        status TEXT DEFAULT 'Open',
        shipping_address TEXT,
        notes TEXT,
        subtotal REAL DEFAULT 0,
        tax REAL DEFAULT 0,
        total REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS sales_order_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        item_id INTEGER,
        description TEXT,
        quantity_ordered REAL DEFAULT 0,
        quantity_picked REAL DEFAULT 0,
        quantity_shipped REAL DEFAULT 0,
        unit_price REAL DEFAULT 0,
        line_total REAL DEFAULT 0,
        FOREIGN KEY (order_id) REFERENCES sales_orders(id),
        FOREIGN KEY (item_id) REFERENCES items(id)
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS pick_lists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        assigned_to TEXT,
        status TEXT DEFAULT 'Pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        notes TEXT,
        FOREIGN KEY (order_id) REFERENCES sales_orders(id)
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS packing_slips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        pick_list_id INTEGER,
        packed_by TEXT,
        packed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        box_count INTEGER DEFAULT 1,
        weight REAL,
        notes TEXT,
        FOREIGN KEY (order_id) REFERENCES sales_orders(id)
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS shipments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        packing_slip_id INTEGER,
        carrier TEXT,
        tracking_number TEXT,
        shipping_method TEXT,
        shipped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        estimated_delivery DATE,
        actual_delivery DATE,
        shipping_cost REAL DEFAULT 0,
        status TEXT DEFAULT 'Shipped',
        notes TEXT,
        FOREIGN KEY (order_id) REFERENCES sales_orders(id)
      )
    `).run();
  },

  // Sales Orders
  createOrder(data, lines) {
    const orderNum = data.order_number || `SO-${Date.now()}`;
    const res = db.prepare(`
      INSERT INTO sales_orders (order_number, customer_id, order_date, expected_ship_date, status, shipping_address, notes, subtotal, tax, total)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(orderNum, data.customer_id, data.order_date || null, data.expected_ship_date || null, 'Open',
           data.shipping_address || '', data.notes || '', data.subtotal || 0, data.tax || 0, data.total || 0);
    const orderId = res.lastInsertRowid;
    const lineStmt = db.prepare(`INSERT INTO sales_order_lines (order_id, item_id, description, quantity_ordered, unit_price, line_total) VALUES (?,?,?,?,?,?)`);
    for (const l of (lines || [])) {
      lineStmt.run(orderId, l.item_id || null, l.description || '', l.quantity || 0, l.unit_price || 0, l.line_total || (l.quantity * l.unit_price) || 0);
    }
    return { success: true, id: orderId, order_number: orderNum };
  },

  getOrder(id) {
    const order = db.prepare(`
      SELECT so.*, c.display_name AS customer_name
      FROM sales_orders so
      LEFT JOIN customers c ON c.id = so.customer_id
      WHERE so.id = ?
    `).get(id);
    if (!order) return null;
    order.lines = db.prepare(`
      SELECT sol.*, i.name AS item_name, i.code AS item_code
      FROM sales_order_lines sol
      LEFT JOIN items i ON i.id = sol.item_id
      WHERE sol.order_id = ?
    `).all(id);
    return order;
  },

  listOrders(status) {
    let sql = `SELECT so.*, c.display_name AS customer_name FROM sales_orders so LEFT JOIN customers c ON c.id = so.customer_id`;
    const params = [];
    if (status) { sql += ` WHERE so.status = ?`; params.push(status); }
    sql += ` ORDER BY so.created_at DESC`;
    return db.prepare(sql).all(...params);
  },

  updateOrderStatus(id, status) {
    db.prepare(`UPDATE sales_orders SET status = ? WHERE id = ?`).run(status, id);
    return { success: true };
  },

  // Pick Lists
  createPickList(orderId, assignedTo) {
    const res = db.prepare(`INSERT INTO pick_lists (order_id, assigned_to, status) VALUES (?, ?, 'Pending')`).run(orderId, assignedTo || null);
    db.prepare(`UPDATE sales_orders SET status = 'Picking' WHERE id = ?`).run(orderId);
    return { success: true, id: res.lastInsertRowid };
  },

  getPickList(id) {
    const pick = db.prepare(`SELECT pl.*, so.order_number FROM pick_lists pl LEFT JOIN sales_orders so ON so.id = pl.order_id WHERE pl.id = ?`).get(id);
    if (!pick) return null;
    pick.lines = db.prepare(`
      SELECT sol.*, i.name AS item_name, i.code AS item_code
      FROM sales_order_lines sol
      LEFT JOIN items i ON i.id = sol.item_id
      WHERE sol.order_id = ?
    `).all(pick.order_id);
    return pick;
  },

  confirmPick(pickListId, pickedItems) {
    const pick = db.prepare(`SELECT * FROM pick_lists WHERE id = ?`).get(pickListId);
    if (!pick) throw new Error('Pick list not found');
    for (const item of (pickedItems || [])) {
      db.prepare(`UPDATE sales_order_lines SET quantity_picked = ? WHERE id = ?`).run(item.quantity_picked || 0, item.line_id);
    }
    db.prepare(`UPDATE pick_lists SET status = 'Completed', completed_at = datetime('now') WHERE id = ?`).run(pickListId);
    db.prepare(`UPDATE sales_orders SET status = 'Picked' WHERE id = ?`).run(pick.order_id);
    return { success: true };
  },

  // Packing
  createPackingSlip(orderId, pickListId, packedBy, boxCount, weight, notes) {
    const res = db.prepare(`INSERT INTO packing_slips (order_id, pick_list_id, packed_by, box_count, weight, notes) VALUES (?,?,?,?,?,?)`)
      .run(orderId, pickListId || null, packedBy || null, boxCount || 1, weight || null, notes || '');
    db.prepare(`UPDATE sales_orders SET status = 'Packed' WHERE id = ?`).run(orderId);
    return { success: true, id: res.lastInsertRowid };
  },

  getPackingSlip(id) {
    const slip = db.prepare(`SELECT ps.*, so.order_number FROM packing_slips ps LEFT JOIN sales_orders so ON so.id = ps.order_id WHERE ps.id = ?`).get(id);
    if (!slip) return null;
    slip.lines = db.prepare(`
      SELECT sol.*, i.name AS item_name FROM sales_order_lines sol LEFT JOIN items i ON i.id = sol.item_id WHERE sol.order_id = ?
    `).all(slip.order_id);
    return slip;
  },

  // Shipments
  createShipment(data) {
    const res = db.prepare(`
      INSERT INTO shipments (order_id, packing_slip_id, carrier, tracking_number, shipping_method, estimated_delivery, shipping_cost, notes, status)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(data.order_id, data.packing_slip_id || null, data.carrier || '', data.tracking_number || '',
           data.shipping_method || '', data.estimated_delivery || null, data.shipping_cost || 0, data.notes || '', 'Shipped');

    // Update order lines shipped quantities
    const lines = db.prepare(`SELECT * FROM sales_order_lines WHERE order_id = ?`).all(data.order_id);
    for (const l of lines) {
      db.prepare(`UPDATE sales_order_lines SET quantity_shipped = quantity_picked WHERE id = ?`).run(l.id);
    }
    db.prepare(`UPDATE sales_orders SET status = 'Shipped' WHERE id = ?`).run(data.order_id);

    return { success: true, id: res.lastInsertRowid };
  },

  getShipment(id) {
    return db.prepare(`SELECT s.*, so.order_number FROM shipments s LEFT JOIN sales_orders so ON so.id = s.order_id WHERE s.id = ?`).get(id);
  },

  listShipments(orderId) {
    if (orderId) return db.prepare(`SELECT * FROM shipments WHERE order_id = ? ORDER BY shipped_at DESC`).all(orderId);
    return db.prepare(`SELECT s.*, so.order_number FROM shipments s LEFT JOIN sales_orders so ON so.id = s.order_id ORDER BY s.shipped_at DESC`).all();
  },

  confirmDelivery(shipmentId, deliveryDate) {
    db.prepare(`UPDATE shipments SET actual_delivery = ?, status = 'Delivered' WHERE id = ?`).run(deliveryDate || new Date().toISOString().slice(0,10), shipmentId);
    const shipment = db.prepare(`SELECT order_id FROM shipments WHERE id = ?`).get(shipmentId);
    if (shipment) {
      db.prepare(`UPDATE sales_orders SET status = 'Delivered' WHERE id = ?`).run(shipment.order_id);
    }
    return { success: true };
  },

  deleteOrder(id) {
    db.prepare(`DELETE FROM sales_order_lines WHERE order_id = ?`).run(id);
    db.prepare(`DELETE FROM pick_lists WHERE order_id = ?`).run(id);
    db.prepare(`DELETE FROM packing_slips WHERE order_id = ?`).run(id);
    db.prepare(`DELETE FROM shipments WHERE order_id = ?`).run(id);
    db.prepare(`DELETE FROM sales_orders WHERE id = ?`).run(id);
    return { success: true };
  }
};

PickPackShip.createTables();

module.exports = PickPackShip;
