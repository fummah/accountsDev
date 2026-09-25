import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Button, Upload, message, Modal, Space, Tooltip, Spin } from 'antd';
import {
  PaperClipOutlined, UploadOutlined, FilePdfOutlined, FileImageOutlined,
  FileWordOutlined, FileExcelOutlined, FileTextOutlined, FileOutlined,
  EyeOutlined, DeleteOutlined,
} from '@ant-design/icons';
import moment from 'moment';

/**
 * AttachmentManager — the ONE attachment UI + lifecycle used everywhere a
 * record can carry supporting documents (Bill, Write Check, Credit Card Charge,
 * Document Center, …).
 *
 * It deliberately keeps two DISTINCT collections:
 *   • pendingFiles — File objects picked in the current form session, not yet
 *     persisted. They live only in the form's state.
 *   • saved        — rows already stored by the backend (loaded by entity id).
 *
 * The parent owns `pendingFiles` (so it can flush them after saving the record)
 * and calls the imperative `uploadPending(newEntityId)` once the record exists.
 * Saved attachments are loaded/refreshed by the component itself.
 *
 * All filesystem work is done by the backend: Open/Remove act on the attachment
 * ID (never a renderer-supplied path). Pending "Open" uses the OS file picker's
 * own path via the preload helper, never a stored path.
 */

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB'];
export const formatAttachmentSize = (bytes) => {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  let v = n; let i = 0;
  while (v >= 1024 && i < SIZE_UNITS.length - 1) { v /= 1024; i++; }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${SIZE_UNITS[i]}`;
};

/** Icon + short type label from a filename / mime type. */
export const attachmentMeta = (name = '', mime = '') => {
  const ext = String(name).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';
  const m = String(mime || '').toLowerCase();
  if (ext === 'pdf' || m.includes('pdf')) return { icon: <FilePdfOutlined />, label: 'PDF', color: '#e5484d' };
  if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'tif', 'tiff', 'svg'].includes(ext) || m.startsWith('image/')) return { icon: <FileImageOutlined />, label: ext ? ext.toUpperCase() : 'IMAGE', color: '#3b82f6' };
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext) || m.includes('word')) return { icon: <FileWordOutlined />, label: ext ? ext.toUpperCase() : 'DOC', color: '#2563eb' };
  if (['xls', 'xlsx', 'ods', 'csv'].includes(ext) || m.includes('excel') || m.includes('spreadsheet')) return { icon: <FileExcelOutlined />, label: ext ? ext.toUpperCase() : 'SHEET', color: '#16a34a' };
  if (['txt', 'log', 'md'].includes(ext) || m.startsWith('text/')) return { icon: <FileTextOutlined />, label: ext ? ext.toUpperCase() : 'TEXT', color: '#64748b' };
  return { icon: <FileOutlined />, label: ext ? ext.toUpperCase() : 'FILE', color: '#64748b' };
};

const readFileAsDataURL = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve((reader.result || '').toString());
  reader.onerror = () => reject(new Error('FileReader failed'));
  reader.readAsDataURL(file);
});

const rowStyle = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '8px 10px', border: '1px solid var(--al-form-section-border, #d9d9d9)',
  borderRadius: 8, background: '#fff', marginBottom: 6,
};

const AttachmentManager = React.forwardRef(({
  entityType,
  entityId = null,
  pendingFiles = [],
  onPendingChange,
  autoUpload = false,
  disabled = false,
  accept,
  entityLabel = 'record',
  emptyText = 'No attachments yet.',
  onUploaded,
  onChanged,
}, ref) => {
  const [saved, setSaved] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const pendingRef = useRef(pendingFiles);
  pendingRef.current = pendingFiles;

  const loadSaved = useCallback(async () => {
    if (entityId == null) { setSaved([]); return; }
    setLoading(true);
    try {
      // entityId '' → load the whole category (Document Center behaviour);
      // a real id → just that record.
      const list = await window.electronAPI.getDocuments(entityType, entityId === '' ? undefined : String(entityId));
      setSaved(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error('[attachments] load failed:', e);
      setSaved([]);
    } finally { setLoading(false); }
  }, [entityType, entityId]);

  useEffect(() => { loadSaved(); }, [loadSaved]);

  const uploadFiles = useCallback(async (files, targetId) => {
    if (!files || !files.length) return { uploaded: 0, failed: 0 };
    setUploading(true);
    let uploaded = 0; let failed = 0;
    for (const file of files) {
      try {
        const base64 = await readFileAsDataURL(file);
        const res = await window.electronAPI.uploadDocument({
          name: file.name,
          mime: file.type || 'application/octet-stream',
          data: base64,
          category: entityType,
          linkedId: Number(targetId) || targetId || 0,
          enteredBy: 'system',
        });
        if (res?.success) { uploaded++; onUploaded?.(res, file); }
        else { failed++; console.error('[attachments] upload failed:', res?.error); message.error('Attachment could not be saved.'); }
      } catch (e) {
        failed++;
        console.error('[attachments] upload threw:', e);
        message.error('Attachment could not be saved.');
      }
    }
    setUploading(false);
    if (uploaded) await loadSaved();
    onChanged?.();
    return { uploaded, failed };
  }, [entityType, loadSaved, onUploaded, onChanged]);

  const addPending = useCallback((files) => {
    if (disabled) return;
    const list = (Array.isArray(files) ? files : [files]).filter(Boolean);
    if (!list.length) return;
    if (autoUpload) {
      // Management screens persist immediately against the current entity id.
      uploadFiles(list, entityId);
    } else {
      onPendingChange?.([...pendingRef.current, ...list]);
    }
  }, [disabled, autoUpload, entityId, uploadFiles, onPendingChange]);

  const removePending = useCallback((idx) => {
    const next = pendingRef.current.filter((_, i) => i !== idx);
    onPendingChange?.(next);
  }, [onPendingChange]);

  const openPending = useCallback(async (file) => {
    try {
      // The OS file picker's own path, resolved in the preload (Electron's
      // webUtils). Never a stored/arbitrary renderer path.
      const res = await window.electronAPI.openLocalAttachment?.(file);
      if (!res?.success) {
        console.error('[attachments] open pending failed:', res?.error);
        message.error('Unable to open this attachment.');
      }
    } catch (e) {
      console.error('[attachments] open pending threw:', e);
      message.error('Unable to open this attachment.');
    }
  }, []);

  const openSaved = useCallback(async (doc) => {
    setBusyId(doc.id);
    try {
      const res = await window.electronAPI.openDocument(doc.id);
      if (!res?.success) {
        console.error('[attachments] open saved failed:', res?.error);
        message.error(/not found|missing/i.test(res?.error || '')
          ? 'Attachment file could not be found.'
          : 'Unable to open this attachment.');
      }
    } catch (e) {
      console.error('[attachments] open saved threw:', e);
      message.error('Unable to open this attachment.');
    } finally { setBusyId(null); }
  }, []);

  const confirmRemoveSaved = useCallback((doc) => {
    Modal.confirm({
      title: 'Remove attachment?',
      content: `"${doc.document_name || 'This file'}" will be removed from this ${entityLabel}.`,
      okText: 'Remove',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        setBusyId(doc.id);
        try {
          const res = await window.electronAPI.deleteDocument(doc.id);
          if (!res?.success) throw new Error(res?.error || 'delete failed');
          setSaved(prev => prev.filter(d => d.id !== doc.id));
          message.success('Attachment removed.');
          onChanged?.();
        } catch (e) {
          console.error('[attachments] remove failed:', e);
          message.error('Attachment could not be removed. Please try again.');
          throw e; // keep the modal open so the row is not falsely removed
        } finally { setBusyId(null); }
      },
    });
  }, [entityLabel, onChanged]);

  // The parent flushes pending files once the record has an id.
  useImperativeHandle(ref, () => ({
    async uploadPending(targetId) {
      const files = pendingRef.current || [];
      if (!files.length) return { uploaded: 0, failed: 0 };
      const res = await uploadFiles(files, targetId);
      if (res.failed === 0) onPendingChange?.([]);
      else onPendingChange?.(files.slice(res.uploaded));
      return res;
    },
    reload: loadSaved,
  }), [uploadFiles, onPendingChange, loadSaved]);

  const renderRow = (key, { name, mime, size, date, pending, onOpen, onRemove, busy }) => {
    const meta = attachmentMeta(name, mime);
    const parts = [meta.label, formatAttachmentSize(size), pending ? 'Pending' : (date ? moment(date).format('MMM D, YYYY') : '')].filter(Boolean);
    return (
      <div key={key} style={rowStyle}>
        <span style={{ fontSize: 20, color: meta.color, lineHeight: 1, flexShrink: 0 }}>{meta.icon}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#262626', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>
            {name}
          </div>
          <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 1 }}>{parts.join(' • ')}</div>
        </div>
        <Space size={4} style={{ flexShrink: 0 }}>
          <Tooltip title="Open">
            <Button size="small" type="text" icon={<EyeOutlined />} loading={!!busy} disabled={!!busy}
              aria-label={`Open attachment ${name}`} onClick={onOpen} />
          </Tooltip>
          <Tooltip title="Remove attachment">
            <Button size="small" type="text" danger icon={<DeleteOutlined />} disabled={!!busy}
              aria-label={`Remove attachment ${name}`} onClick={onRemove} />
          </Tooltip>
        </Space>
      </div>
    );
  };

  return (
    <div>
      {loading && saved.length === 0 ? (
        <div style={{ padding: '6px 0' }}><Spin size="small" /></div>
      ) : null}

      {saved.map(doc => renderRow(
        `saved-${doc.id}`,
        {
          name: doc.document_name || doc.file_path || doc.random_number || 'Attachment',
          mime: doc.document_type,
          size: doc.document_size,
          date: doc.date_entered,
          pending: false,
          busy: busyId === doc.id,
          onOpen: () => openSaved(doc),
          onRemove: () => confirmRemoveSaved(doc),
        }
      ))}

      {pendingFiles.map((file, idx) => renderRow(
        `pending-${idx}-${file.name}`,
        {
          name: file.name,
          mime: file.type,
          size: file.size,
          pending: true,
          onOpen: () => openPending(file),
          onRemove: () => removePending(idx),
        }
      ))}

      {!loading && saved.length === 0 && pendingFiles.length === 0 ? (
        <div style={{ fontSize: 12, color: '#bfbfbf', marginBottom: 6 }}>{emptyText}</div>
      ) : null}

      <Upload
        multiple
        accept={accept}
        showUploadList={false}
        beforeUpload={(file) => { addPending(file); return false; }}
        disabled={disabled || uploading}
      >
        <Button icon={uploading ? <PaperClipOutlined /> : <UploadOutlined />} loading={uploading} disabled={disabled}>
          Add Attachment
        </Button>
      </Upload>
    </div>
  );
});

AttachmentManager.displayName = 'AttachmentManager';
export default AttachmentManager;
