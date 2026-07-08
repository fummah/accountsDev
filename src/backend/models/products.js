const db = require('./dbmgr.js');

const Products = {
  createTable: () => {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        name TEXT,
        sku TEXT,
        category TEXT,
        description TEXT,
        price REAL NOT NULL,
        income_account TEXT,
        tax_inclusive TEXT,
        tax TEXT,
        isfromsupplier TEXT,
        stock INTEGER DEFAULT 0,
        entered_by TEXT,
        date_entered DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    db.prepare(`
      CREATE TABLE IF NOT EXISTS product_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    // Add stock column if missing (migration for existing databases)
    try { db.prepare("ALTER TABLE products ADD COLUMN stock INTEGER DEFAULT 0").run(); } catch {}
    // Create product_types table
    db.prepare(`
      CREATE TABLE IF NOT EXISTS product_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  },

  insertProduct: async (type, name, sku, category, description, price, income_account, tax_inclusive, tax, isfromsupplier, entered_by, stock) => {
    try {
      const stmt = db.prepare('INSERT INTO products (type, name, sku, category, description, price, income_account, tax_inclusive, tax, isfromsupplier, entered_by, stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      const result = await stmt.run(type, name, sku, category, description, price, income_account, tax_inclusive, tax, isfromsupplier, entered_by, stock != null ? stock : 0);
      if (result.changes > 0) {
        return { success: true, id: result.lastInsertRowid };
      } else {
        return { success: false };
      }
    } catch (error) {
      console.error("Error inserting product:", error);
      return { success: false };
    }
  },

  getAllProducts: () => {
    const stmt = db.prepare('SELECT * FROM products ORDER BY id DESC');
    return stmt.all();
  },

  getPaginated: (page = 1, pageSize = 25, search = '', typeFilter = '') => {
    const offset = (Math.max(1, page) - 1) * Math.max(1, pageSize);
    const limit = Math.max(1, Math.min(500, pageSize));
    const searchParam = search && search.trim() ? `%${search.trim()}%` : null;
    const typeParam = typeFilter && typeFilter.trim() ? typeFilter.trim() : null;
    let total;
    let data;
    const whereParts = [];
    const params = [];
    if (searchParam) {
      whereParts.push('(name LIKE ? OR sku LIKE ? OR category LIKE ?)');
      params.push(searchParam, searchParam, searchParam);
    }
    if (typeParam) {
      whereParts.push('type = ?');
      params.push(typeParam);
    }
    const whereClause = whereParts.length ? ` WHERE ${whereParts.join(' AND ')}` : '';
    if (params.length) {
      total = db.prepare(`SELECT COUNT(*) AS total FROM products${whereClause}`).get(...params).total;
      data = db.prepare(`SELECT * FROM products${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
    } else {
      total = db.prepare('SELECT COUNT(*) AS total FROM products').get().total;
      data = db.prepare('SELECT * FROM products ORDER BY id DESC LIMIT ? OFFSET ?').all(limit, offset);
    }
    return { data, total };
  },

  updateProduct: async (productData) => {
    const { id, ...p } = productData;
    try {
      db.prepare(`UPDATE products SET type = ?, name = ?, sku = ?, category = ?, description = ?, price = ?, income_account = ?, tax_inclusive = ?, tax = ?, isfromsupplier = ?, stock = ? WHERE id = ?`).run(
        p.type || null,
        p.name || null,
        p.sku || null,
        p.category || null,
        p.description || null,
        p.price != null ? p.price : (p.selling_price != null ? p.selling_price : null),
        p.income_account || null,
        p.tax_inclusive || null,
        p.tax || null,
        p.isfromsupplier || null,
        p.stock != null ? p.stock : 0,
        id
      );
      return { success: true, message: 'Product updated successfully.' };
    } catch (error) {
      console.error('Error updating Product:', error);
      throw error;
    }
  },

  deleteProduct: (id) => {
    try {
      const result = db.prepare('DELETE FROM products WHERE id = ?').run(id);
      return { success: result.changes > 0 };
    } catch (error) {
      console.error('Error deleting product:', error);
      return { success: false, error: error.message };
    }
  },

  getAllCategories: () => {
    const stmt = db.prepare('SELECT * FROM product_categories ORDER BY name ASC');
    return stmt.all();
  },

  insertCategory: (name) => {
    try {
      const result = db.prepare('INSERT INTO product_categories (name) VALUES (?)').run(name);
      return { success: true, id: result.lastInsertRowid };
    } catch (error) {
      if (error.message && error.message.includes('UNIQUE')) {
        return { success: false, error: 'Category already exists' };
      }
      console.error('Error inserting category:', error);
      return { success: false, error: error.message };
    }
  },

  deleteCategory: (id) => {
    try {
      const result = db.prepare('DELETE FROM product_categories WHERE id = ?').run(id);
      return { success: result.changes > 0 };
    } catch (error) {
      console.error('Error deleting category:', error);
      return { success: false, error: error.message };
    }
  },

  getAllTypes: () => {
    const stmt = db.prepare('SELECT * FROM product_types ORDER BY name ASC');
    return stmt.all();
  },

  insertType: (name) => {
    try {
      const result = db.prepare('INSERT INTO product_types (name) VALUES (?)').run(name);
      return { success: true, id: result.lastInsertRowid };
    } catch (error) {
      if (error.message && error.message.includes('UNIQUE')) {
        return { success: false, error: 'Type already exists' };
      }
      console.error('Error inserting type:', error);
      return { success: false, error: error.message };
    }
  },

  deleteType: (id) => {
    try {
      const result = db.prepare('DELETE FROM product_types WHERE id = ?').run(id);
      return { success: result.changes > 0 };
    } catch (error) {
      console.error('Error deleting type:', error);
      return { success: false, error: error.message };
    }
  },
};

Products.createTable();

module.exports = Products;
