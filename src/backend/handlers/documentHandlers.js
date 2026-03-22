const { ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { Documents } = require('../models');

function registerDocumentHandlers() {
  const baseDir = path.join(__dirname, '..', 'db', 'attachments');
  try { fs.mkdirSync(baseDir, { recursive: true }); } catch {}

  ipcMain.handle('documents-list', async (_e, category, linkedId) => {
    try {
      let rows = Documents.getAllDocuments();
      if (category) {
        rows = rows.filter(r => r.category === category);
      }
      if (linkedId != null && linkedId !== '') {
        rows = rows.filter(r => String(r.linked_id) === String(linkedId));
      }
      // Attach absolute file path for convenience
      return rows.map(r => ({
        ...r,
        absolute_path: r.file_path ? path.join(baseDir, r.file_path) : null,
      }));
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('document-upload', async (_e, payload) => {
    try {
      const { name, mime, data, category, linkedId, enteredBy } = payload || {};
      if (!name || !data || !category || typeof linkedId === 'undefined') {
        throw new Error('Missing required fields');
      }
      const safeName = path.basename(name);
      const stamp = Date.now();
      const fileName = `${stamp}_${safeName}`;
      const filePath = path.join(baseDir, fileName);

      const base64 = typeof data === 'string' ? data.split(',').pop() : data;
      const buffer = Buffer.from(base64, 'base64');
      fs.writeFileSync(filePath, buffer);

      const res = await Documents.insertDocuments(
        safeName,
        String(buffer.length),
        mime || '',
        fileName,
        category,
        Number(linkedId) || 0,
        enteredBy || 'system'
      );
      if (res && res.lastInsertRowid) {
        // update file_path column if present
        try {
          const db = require('../models/dbmgr');
          db.prepare('UPDATE documents SET file_seen = 1 WHERE 1=0').run();
        } catch {}
      }
      return { success: true, path: filePath };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('document-open', async (_e, id) => {
    try {
      const row = Documents.getDocumentById(id);
      if (!row) return { success: false, error: 'Not found' };
      const basePath = path.join(__dirname, '..', 'db', 'attachments');
      const filePath = row.file_path ? path.join(basePath, row.file_path) : null;
      if (!filePath || !fs.existsSync(filePath)) {
        return { success: false, error: 'File not found on disk' };
      }
      const result = await shell.openPath(filePath);
      return { success: result === '' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('document-delete', async (_e, id) => {
    try {
      const row = Documents.getDocumentById(id);
      if (!row) return { success: false, error: 'Not found' };
      const basePath = path.join(__dirname, '..', 'db', 'attachments');
      const filePath = row.file_path ? path.join(basePath, row.file_path) : null;
      if (filePath && fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch {}
      }
      const res = await Documents.deleteDocument(id);
      return { success: true, changes: res.changes || 0 };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
}

module.exports = registerDocumentHandlers;


