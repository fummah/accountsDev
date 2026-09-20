const { ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { Documents } = require('../models');
const FileStorage = require('../services/fileStorage');

function registerDocumentHandlers() {
  // Resolve + create the persistent attachments directory, and pull any files
  // that were saved into the old source-relative folder into the new store.
  try {
    const dir = FileStorage.ensureAttachmentsDir();
    const { migrated } = FileStorage.migrateLegacyAttachments();
    console.log(`[documents] Attachment storage directory: ${dir}${migrated ? ` (migrated ${migrated} legacy file(s))` : ''}`);
  } catch (e) {
    console.error('[documents] Could not prepare attachment storage:', e.message);
  }

  ipcMain.handle('documents-list', async (_e, category, linkedId) => {
    try {
      let rows = Documents.getAllDocuments();
      if (category) {
        rows = rows.filter(r => r.category === category);
      }
      if (linkedId != null && linkedId !== '') {
        rows = rows.filter(r => String(r.linked_id) === String(linkedId));
      }
      // Attach the runtime absolute path (resolved from the persistent store).
      return rows.map(r => ({
        ...r,
        absolute_path: FileStorage.resolveAttachmentPath(r.file_path),
      }));
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('document-upload', async (_e, payload) => {
    let stored = null;
    try {
      const { name, mime, data, category, linkedId, enteredBy } = payload || {};
      if (!name || !data || !category || typeof linkedId === 'undefined') {
        throw new Error('Missing required fields');
      }
      // The human-readable original name (basename only) is kept in the DB;
      // the file on disk gets a sanitized, collision-safe stored name.
      const originalName = path.basename(String(name));

      stored = FileStorage.storeAttachment({ name, data });

      const res = await Documents.insertDocuments(
        originalName,
        String(stored.size),
        mime || '',
        stored.storedName,
        category,
        Number(linkedId) || 0,
        enteredBy || 'system'
      );
      if (!res || !res.success) {
        // No DB record → do not leave the copied file behind.
        try { fs.unlinkSync(stored.path); } catch (_) { /* ignore */ }
        return { success: false, error: 'Document record could not be saved' };
      }
      return { success: true, storedName: stored.storedName };
    } catch (e) {
      // Clean up a partially written file if the DB step never completed.
      if (stored && stored.path) { try { fs.unlinkSync(stored.path); } catch (_) { /* ignore */ } }
      console.error('[documents] upload failed:', e.message);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('document-open', async (_e, id) => {
    try {
      const row = Documents.getDocumentById(id);
      if (!row) return { success: false, error: 'Not found' };
      const filePath = FileStorage.resolveAttachmentPath(row.file_path);
      if (!filePath || !fs.existsSync(filePath)) {
        return { success: false, error: 'File not found on disk' };
      }
      const result = await shell.openPath(filePath);
      return result === '' ? { success: true } : { success: false, error: result };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('document-delete', async (_e, id) => {
    try {
      const row = Documents.getDocumentById(id);
      if (!row) return { success: false, error: 'Not found' };
      const filePath = FileStorage.resolveAttachmentPath(row.file_path);
      if (filePath && fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (_) { /* ignore */ }
      }
      const res = await Documents.deleteDocument(id);
      return { success: true, changes: res.changes || 0 };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
}

module.exports = registerDocumentHandlers;
