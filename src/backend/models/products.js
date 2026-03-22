// src/backend/models/products.js
const db = require('./dbmgr.js');

const Products = {
  // Create the Products table if it doesn't exist
  createTable: () => {
    const stmt = `
      CREATE TABLE IF NOT EXISTS products (
    id	INTEGER,
	type	TEXT NOT NULL,
	name	TEXT,
	sku	TEXT,
	category	TEXT,
	description	TEXT,
  price REAL NOT NULL,
  income_account	TEXT,
  tax_inclusive	TEXT,
  tax	TEXT,
  isfromsupplier	TEXT,
	entered_by	TEXT,
	date_entered DATETIME DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY(id AUTOINCREMENT)
      )
    `;
    db.prepare(stmt).run();
  },

  // Insert a new product
  insertProduct: async (type,name,sku, category, description,price,income_account,tax_inclusive,tax,isfromsupplier,entered_by) => {
    try {
    const stmt = db.prepare('INSERT INTO products (type,name,sku, category, description,price,income_account,tax_inclusive,tax,isfromsupplier,entered_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const result = await stmt.run(type,name,sku, category, description,price,income_account,tax_inclusive,tax,isfromsupplier,entered_by);
   
     
    if (result.changes > 0) {
        return { success: true };
      } else {
        return { success: false };
      }
    } catch (error) {
      console.error("Error inserting product:", error);
      return { success: false };
    }
  },

  // Retrieve all products
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
  updateProduct : async (productData) => {
    const { id, ...productDetails } = productData;
    try {
      // Update the main product details
      await db.prepare(`UPDATE products SET type = ?,name = ?,sku = ?, category = ?, description = ?,price = ?, income_account = ?, tax_inclusive = ?,tax = ?, isfromsupplier = ? WHERE id = ?`).run(
        [
          productDetails.type,
          productDetails.name,
          productDetails.sku,
          productDetails.category,
          productDetails.description,
          productDetails.price,
          productDetails.income_account,
          productDetails.tax_inclusive,
          productDetails.tax,
          productDetails.isfromsupplier,
          id,
        ]
      );
  
      return { success: true, message: 'Product updated successfully.' };
    } catch (error) {
      console.error('Error updating Product:', error);
      throw error;
    }
  },
};

// Ensure the Products table is created
Products.createTable();

module.exports = Products;
