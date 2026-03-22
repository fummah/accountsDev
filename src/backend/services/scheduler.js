const Settings = require('../models/settings');
const AuditLog = require('../models/auditLog');

// Very small, dependency-free scheduler based on setInterval.
// Tasks are defined as { id, name, intervalSec, enabled, lastRunAt }
// Configuration persisted in settings under key 'scheduler.tasks'
class SchedulerService {
	constructor() {
		this.timers = new Map();
		this.registry = new Map();
		this.loadBuiltInTasks();
	}

	loadBuiltInTasks() {
		// Built-in tasks can be toggled via settings overrides
		this.registerTask('backup:daily', 'Daily database backup', 24 * 60 * 60, async () => {
			try {
				const backupHandlers = require('../handlers/backupHandlers');
				if (typeof backupHandlers.runBackupNow === 'function') {
					const result = backupHandlers.runBackupNow();
					AuditLog.log({
						userId: 'system',
						action: 'scheduledBackupComplete',
						entityType: 'system',
						entityId: 'backup:daily',
						details: { path: result?.path, encrypted: true }
					});
				}
			} catch (e) {
				AuditLog.log({
					userId: 'system',
					action: 'scheduledBackupError',
					entityType: 'system',
					entityId: 'backup:daily',
					details: { error: e?.message || String(e) }
				});
			}
		});

		this.registerTask('kpi:recalc', 'Recalculate dashboard KPIs', 60 * 60, async () => {
			// Placeholder audit until analytics recalculation is implemented
			AuditLog.log({
				userId: 'system',
				action: 'kpiRecalcQueued',
				entityType: 'analytics',
				entityId: 'dashboard',
				details: { note: 'KPI recalculation queued.' }
			});
		});

		this.registerTask('recurring:notify', 'Recurring item reminders', 15 * 60, async () => {
			try {
				const db = require('../models/dbmgr');
				const today = new Date();
				const inMinutes = (d) => Math.floor((d.getTime() - Date.now()) / 60000);
				const rows = db.prepare(`
					SELECT * FROM recurring_transactions 
					WHERE status='active' AND nextDate IS NOT NULL
					ORDER BY nextDate ASC LIMIT 100
				`).all();
				for (const r of rows) {
					const due = new Date(r.nextDate);
					const mins = inMinutes(due);
					// notify when within the next 60 minutes or overdue
					if (mins <= 60) {
						AuditLog.log({
							userId: 'system',
							action: 'recurringReminder',
							entityType: 'recurring',
							entityId: String(r.id),
							details: { description: r.description, amount: r.amount, nextDate: r.nextDate, minutesUntilDue: mins }
						});
					}
				}
			} catch (e) {
				AuditLog.log({
					userId: 'system',
					action: 'recurringCheckError',
					entityType: 'scheduler',
					entityId: 'recurring',
					details: { error: e?.message || String(e) }
				});
			}
		});

		// Inventory reorder alert
		this.registerTask('inventory:reorder-alert', 'Inventory reorder threshold alerts', 60 * 60, async () => {
			try {
				const Inventory = require('../models/inventory');
				const low = Inventory.getReorderList();
				if (Array.isArray(low) && low.length > 0) {
					for (const r of low) {
						AuditLog.log({
							userId: 'system',
							action: 'reorderAlert',
							entityType: 'inventory',
							entityId: `${r.itemId}:${r.warehouseId}`,
							details: { itemId: r.itemId, warehouseId: r.warehouseId, quantity: r.quantity, reorderPoint: r.reorderPoint }
						});
					}
				}
			} catch (e) {
				AuditLog.log({
					userId: 'system',
					action: 'reorderAlertError',
					entityType: 'inventory',
					entityId: 'reorder',
					details: { error: e?.message || String(e) }
				});
			}
		});

		// Auto-post recurring items
		this.registerTask('recurring:post', 'Post due recurring items', 10 * 60, async () => {
			try {
				const db = require('../models/dbmgr');
				const Journal = require('../models/journal');
				const Invoices = require('../models/invoices');
				const Expenses = require('../models/expenses');
				const Payroll = require('../models/payroll');

				const rows = db.prepare(`
					SELECT * FROM recurring_transactions
					WHERE status='active' AND nextDate IS NOT NULL AND date(nextDate) <= date('now')
					ORDER BY nextDate ASC LIMIT 100
				`).all();

				const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
				const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
				const fmt = (d) => d.toISOString().slice(0,10);

				for (const r of rows) {
					try {
						const kind = (r.kind || 'generic').toLowerCase();
						const payload = r.payload ? JSON.parse(r.payload) : {};
						const today = new Date().toISOString().slice(0,10);
						switch (kind) {
							case 'invoice':
								await Invoices.insertInvoice(payload.customer, payload.customer_email, payload.islater, payload.billing_address, payload.terms, payload.start_date || today, payload.last_date || today, payload.message, payload.statement_message, payload.number, payload.entered_by, payload.vat, payload.status || 'Pending', payload.invoiceLines || payload.lines);
								break;
							case 'bill':
								await Expenses.insertExpense(payload.payee, payload.payment_account, payload.payment_date || today, payload.payment_method, payload.ref_no, payload.category, payload.entered_by, payload.approval_status || 'Pending', payload.expenseLines || payload.lines || []);
								break;
							case 'journal':
								await Journal.insert(payload);
								break;
							case 'payroll':
								await Payroll.processPayroll(payload);
								break;
							default:
								break;
						}

						// compute nextDate
						let next = new Date(r.nextDate);
						const f = (r.frequency || '').toLowerCase();
						if (f === 'daily') next = addDays(next, 1);
						else if (f === 'weekly') next = addDays(next, 7);
						else if (f === 'monthly') next = addMonths(next, 1);
						else if (f === 'quarterly') next = addMonths(next, 3);
						else if (f === 'yearly') next = addMonths(next, 12);
						else next = addDays(next, 1);

						db.prepare(`UPDATE recurring_transactions SET nextDate=?, updatedAt=datetime('now') WHERE id=?`).run(fmt(next), r.id);

						AuditLog.log({
							userId: 'system',
							action: 'recurringPosted',
							entityType: 'recurring',
							entityId: String(r.id),
							details: { kind, nextDate: fmt(next) }
						});
					} catch (eItem) {
						AuditLog.log({
							userId: 'system',
							action: 'recurringPostError',
							entityType: 'recurring',
							entityId: String(r.id),
							details: { error: eItem?.message || String(eItem) }
						});
					}
				}
			} catch (e) {
				AuditLog.log({
					userId: 'system',
					action: 'recurringPostTaskError',
					entityType: 'scheduler',
					entityId: 'recurring',
					details: { error: e?.message || String(e) }
				});
			}
		});

		// Scan a local folder for offline bank statements and auto-parse
		this.registerTask('statement:inbox-scan', 'Scan bank statement inbox', 60, async () => {
			try {
				const inbox = Settings.get('bankStatement.inboxPath');
				if (!inbox) return;
				const fs = require('fs');
				const path = require('path');
				if (!fs.existsSync(inbox)) return;
				const processedDir = path.join(inbox, 'processed');
				if (!fs.existsSync(processedDir)) {
					try { fs.mkdirSync(processedDir, { recursive: true }); } catch {}
				}
				const files = fs.readdirSync(inbox).filter(f => !fs.statSync(path.join(inbox, f)).isDirectory());
				for (const fname of files) {
					try {
						const full = path.join(inbox, fname);
						const lower = fname.toLowerCase();
						const stamp = new Date().toISOString().replace(/[:.]/g, '-');
						let parsed = null;
						let meta = { bankName: 'Inbox', currency: null };
						const { ParsedStatements } = require('../models');

						const simpleCsvParse = (csvText) => {
							const lines = (csvText || '').split(/\r?\n/).filter(l => l.trim().length > 0);
							if (!lines.length) return { headers: [], rows: [] };
							const parseLine = (line) => {
								const out = []; let cur=''; let q=false;
								for (let i=0;i<line.length;i++){ const ch=line[i];
									if (ch==='"'){ if (q && line[i+1]==='"'){cur+='"'; i++;} else {q=!q;} }
									else if (ch===',' && !q){ out.push(cur); cur=''; }
									else { cur+=ch; } }
								out.push(cur); return out.map(x=>x.trim().replace(/^"|"$/g,''));
							};
							const headers = parseLine(lines[0]).map(h=>h.toLowerCase());
							const rows = lines.slice(1).map(parseLine);
							return { headers, rows };
						};
						const normalizeRow = (headers, row) => {
							const idx=(arr)=>{ for(const k of arr){ const i=headers.indexOf(k); if(i!==-1) return i;} return -1;};
							const di=idx(['date','transaction date','posting date']);
							const ti=idx(['description','memo','details','narration']);
							const ai=idx(['amount','amt','value','transaction amount']); const dbi=idx(['debit','withdrawal','debits']); const cri=idx(['credit','deposit','credits']);
							let amt=0;
							if (ai>=0) { amt = parseFloat((row[ai]||'0').replace(/[.,](?=\d{3}\b)/g,'').replace(',','.'))||0; }
							else { const d=parseFloat((row[dbi]||'0').replace(/[.,](?=\d{3}\b)/g,'').replace(',','.'))||0; const c=parseFloat((row[cri]||'0').replace(/[.,](?=\d{3}\b)/g,'').replace(',','.'))||0; amt=c-d; }
							return { date: di>=0?row[di]:null, description: ti>=0?row[ti]:null, amount: amt, type: amt>=0?'credit':'debit' };
						};

						if (lower.endsWith('.csv')) {
							const text = fs.readFileSync(full, 'utf8');
							const { headers, rows } = simpleCsvParse(text);
							const txs = rows.map(r => normalizeRow(headers, r));
							const st = ParsedStatements.createStatement(meta);
							ParsedStatements.insertTransactions(st.id, txs);
							parsed = { count: txs.length, statementId: st.id };
						} else if (lower.endsWith('.txt')) {
							const text = fs.readFileSync(full, 'utf8');
							const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
							const dp1=/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/; const dp2=/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/; const amount=/([+-]?\d{1,3}(?:[\.,]\d{3})*(?:[\.,]\d{2})|[+-]?\d+(?:[\.,]\d{2})?)/;
							const txs=[];
							for(const line of lines){ let m=line.match(dp1); let date=null;
								if(m){date=`${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`} else { m=line.match(dp2); if(m){date=`${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;}};
								const am= line.match(amount); if(!date||!am) continue; let a=Number((am[1]||'0').replace(/\./g,'').replace(',','.')); if(isNaN(a)) a=Number((am[1]||'0').replace(/,/g,'')); if(isNaN(a)) continue;
								const desc=line.replace(am[0],'').replace(/\s{2,}/g,' ').trim(); txs.push({date, description:desc, amount:a, type:a>=0?'credit':'debit'}); }
							const st = ParsedStatements.createStatement(meta);
							ParsedStatements.insertTransactions(st.id, txs);
							parsed = { count: txs.length, statementId: st.id };
						} else if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
							try {
								const XLSX = require('xlsx');
								const buf = fs.readFileSync(full);
								const wb = XLSX.read(buf, { type: 'buffer' });
								const first = wb.SheetNames[0];
								const ws = wb.Sheets[first];
								const csv = XLSX.utils.sheet_to_csv(ws, { FS: ',', blankrows: false });
								const { headers, rows } = simpleCsvParse(csv);
								const txs = rows.map(r => normalizeRow(headers, r));
								const st = ParsedStatements.createStatement(meta);
								ParsedStatements.insertTransactions(st.id, txs);
								parsed = { count: txs.length, statementId: st.id };
							} catch (e) {
								AuditLog.log({ userId: 'system', action: 'inboxParseError', entityType: 'bankStatement', entityId: fname, details: { error: e.message } });
							}
						} else if (lower.endsWith('.pdf')) {
							try {
								const pdfParse = require('pdf-parse');
								const data = fs.readFileSync(full);
								const out = await pdfParse(data);
								const text = out.text || '';
								const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
								const dp1=/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/; const dp2=/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/; const amount=/([+-]?\d{1,3}(?:[\.,]\d{3})*(?:[\.,]\d{2})|[+-]?\d+(?:[\.,]\d{2})?)/;
								const txs=[];
								for(const line of lines){ let m=line.match(dp1); let date=null;
									if(m){date=`${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`} else { m=line.match(dp2); if(m){date=`${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;}};
									const am= line.match(amount); if(!date||!am) continue; let a=Number((am[1]||'0').replace(/\./g,'').replace(',','.')); if(isNaN(a)) a=Number((am[1]||'0').replace(/,/g,'')); if(isNaN(a)) continue;
									const desc=line.replace(am[0],'').replace(/\s{2,}/g,' ').trim(); txs.push({date, description:desc, amount:a, type:a>=0?'credit':'debit'}); }
								const st = ParsedStatements.createStatement(meta);
								ParsedStatements.insertTransactions(st.id, txs);
								parsed = { count: txs.length, statementId: st.id };
							} catch (e) {
								AuditLog.log({ userId: 'system', action: 'inboxParseSkipPdf', entityType: 'bankStatement', entityId: fname, details: { error: e.message } });
							}
						}

						// Move file to processed
						try { require('fs').renameSync(full, path.join(processedDir, `${stamp}-${fname}`)); } catch {}

						if (parsed) {
							AuditLog.log({ userId: 'system', action: 'inboxParsed', entityType: 'bankStatement', entityId: String(parsed.statementId || ''), details: { file: fname, ...parsed } });
						}
					} catch (eFile) {
						AuditLog.log({ userId: 'system', action: 'inboxError', entityType: 'bankStatement', entityId: '', details: { file: fname, error: eFile.message } });
					}
				}
			} catch (e) {
				AuditLog.log({ userId: 'system', action: 'inboxScanError', entityType: 'bankStatement', entityId: 'inbox', details: { error: e?.message || String(e) } });
			}
		});

		// Payroll: auto-tax update
		this.registerTask('payroll:tax-update', 'Auto-update payroll taxes', 24 * 60 * 60, async () => {
			try {
				const url = Settings.get('payroll.taxFeedUrl');
				if (!url) return;
				const res = await (global.fetch ? fetch(url) : require('node-fetch')(url));
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const csv = await res.text();
				const PayrollConfig = require('../models/payrollConfig');
				await PayrollConfig.importTaxCsv(csv, { country: Settings.get('payroll.country') || 'DEFAULT' });
				AuditLog.log({ userId: 'system', action: 'payrollTaxUpdated', entityType: 'payroll', entityId: 'tax', details: { bytes: csv.length } });
			} catch (e) {
				AuditLog.log({ userId: 'system', action: 'payrollTaxUpdateError', entityType: 'payroll', entityId: 'tax', details: { error: e?.message || String(e) } });
			}
		});

		// Payroll: compliance alerts (min wage & missing deductions)
		this.registerTask('payroll:compliance-alerts', 'Payroll compliance checks', 6 * 60 * 60, async () => {
			try {
				const minWage = Number(Settings.get('payroll.minWage') || 0);
				const db = require('../models/dbmgr');
				// Look at most recent payroll run
				const run = db.prepare(`SELECT id FROM payroll_runs ORDER BY processed_date DESC, id DESC LIMIT 1`).get();
				if (!run) return;
				const details = db.prepare(`SELECT employee_id, gross_pay, other_deductions FROM payroll_details WHERE payroll_run_id=?`).all(run.id);
				for (const r of details) {
					if (minWage > 0 && Number(r.gross_pay||0) < minWage) {
						AuditLog.log({ userId: 'system', action: 'payrollMinWageAlert', entityType: 'payroll', entityId: String(r.employee_id), details: { gross: r.gross_pay, minWage } });
					}
					if (Number(r.other_deductions||0) === 0) {
						AuditLog.log({ userId: 'system', action: 'payrollDeductionMissing', entityType: 'payroll', entityId: String(r.employee_id), details: { note: 'No pension/insurance deductions detected' } });
					}
				}
			} catch (e) {
				AuditLog.log({ userId: 'system', action: 'payrollComplianceError', entityType: 'payroll', entityId: 'compliance', details: { error: e?.message || String(e) } });
			}
		});

		// Inventory: expiry alerts for lots
		this.registerTask('inventory:expiry-alerts', 'Inventory lot expiry alerts', 24 * 60 * 60, async () => {
			try {
				const days = Number(Settings.get('inventory.expiryAlertDays') || 30);
				const Lots = require('../models/lots');
				const expiring = Lots.listExpiringWithin(days);
				for (const l of expiring) {
					if (!l.expiryDate) continue;
					const when = new Date(l.expiryDate);
					const delta = Math.ceil((when - Date.now()) / (1000*60*60*24));
					AuditLog.log({ userId: 'system', action: 'lotExpiryAlert', entityType: 'inventory', entityId: String(l.itemId), details: { lot: l.lot, warehouseId: l.warehouseId, quantity: l.quantity, expiryDate: l.expiryDate, daysUntilExpiry: delta } });
				}
			} catch (e) {
				AuditLog.log({ userId: 'system', action: 'lotExpiryError', entityType: 'inventory', entityId: 'expiry', details: { error: e?.message || String(e) } });
			}
		});

		// Cloud: periodic backup to configured endpoint
		this.registerTask('cloud:backup', 'Upload backup JSON to cloud endpoint', 24 * 60 * 60, async () => {
			try {
				const Settings = require('../models/settings');
				const url = Settings.get('cloudSync.url');
				const token = Settings.get('cloudSync.token');
				if (!url) return; // disabled
				const { ipcMain } = require('electron');
				const exportFn = require('../handlers/cloudSyncHandlers'); // ensure module loaded
				const db = require('../models/dbmgr');
				// Build export payload inline to avoid IPC
				const rows = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).all();
				const payload = { exportedAt: new Date().toISOString(), data: {} };
				for (const r of rows) {
					payload.data[r.name] = db.prepare(`SELECT * FROM ${r.name}`).all();
				}
				const opts = { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token?{ 'Authorization': `Bearer ${token}` }:{}) }, body: JSON.stringify(payload) };
				const res = await (global.fetch ? fetch(url, opts) : require('node-fetch')(url, opts));
				AuditLog.log({ userId: 'system', action: 'cloudBackup', entityType: 'cloud', entityId: 'backup', details: { status: res.status } });
			} catch (e) {
				AuditLog.log({ userId: 'system', action: 'cloudBackupError', entityType: 'cloud', entityId: 'backup', details: { error: e?.message || String(e) } });
			}
		});

		// Background sync engine: push/pull if enabled
		this.registerTask('sync:run', 'Run background sync', 60, async () => {
			try {
				const Settings = require('../models/settings');
				const cfg = Settings.get('sync') || {};
				if (!cfg.enabled) return;
				const syncEngine = require('./syncEngine') || require('../services/syncEngine');
				await syncEngine.runOnce();
			} catch (e) {
				AuditLog.log({ userId: 'system', action: 'syncRunError', entityType: 'sync', entityId: 'background', details: { error: e?.message || String(e) } });
			}
		});

		// Blockchain anchoring task (optional provider)
		this.registerTask('blockchain:anchor', 'Anchor new journal entries', 6 * 60 * 60, async () => {
			try {
				const Settings = require('../models/settings');
				const enabled = Settings.get('blockchain.enabled');
				if (!enabled) return;
				const Anchors = require('../models/auditAnchors');
				await Anchors.anchorPending();
			} catch (e) {
				AuditLog.log({ userId: 'system', action: 'anchorError', entityType: 'blockchain', entityId: 'anchor', details: { error: e?.message || String(e) } });
			}
		});
	}

	registerTask(id, name, intervalSec, handler) {
		this.registry.set(id, { id, name, intervalSec, handler });
	}

	listRegistered() {
		return Array.from(this.registry.values()).map(t => ({
			id: t.id,
			name: t.name,
			intervalSec: t.intervalSec
		}));
	}

	_loadConfig() {
		const cfg = Settings.get('scheduler.tasks');
		return Array.isArray(cfg) ? cfg : [];
	}

	_saveConfig(tasks) {
		Settings.set('scheduler.tasks', tasks);
	}

	listConfigured() {
		return this._loadConfig();
	}

	setConfigured(tasks) {
		// Shallow-validate tasks
		const sanitized = (Array.isArray(tasks) ? tasks : []).map(t => ({
			id: String(t.id),
			enabled: Boolean(t.enabled),
			intervalSec: Number(t.intervalSec) > 0 ? Number(t.intervalSec) : (this.registry.get(t.id)?.intervalSec || 3600),
			lastRunAt: t.lastRunAt || null
		}));
		this._saveConfig(sanitized);
		this.reload();
		return sanitized;
	}

	_stopAll() {
		for (const [id, timer] of this.timers) {
			clearInterval(timer);
			this.timers.delete(id);
		}
	}

	reload() {
		this._stopAll();
		const configured = this._loadConfig();
		for (const cfg of configured) {
			const reg = this.registry.get(cfg.id);
			if (!reg || !cfg.enabled) continue;
			const intervalMs = (cfg.intervalSec || reg.intervalSec) * 1000;
			const timer = setInterval(async () => {
				try {
					await reg.handler();
					cfg.lastRunAt = new Date().toISOString();
					this._saveConfig(configured);
				} catch (e) {
					AuditLog.log({
						userId: 'system',
						action: 'taskError',
						entityType: 'scheduler',
						entityId: cfg.id,
						details: { error: e?.message || String(e) }
					});
				}
			}, intervalMs);
			this.timers.set(cfg.id, timer);
		}
	}
}

const schedulerService = new SchedulerService();

module.exports = schedulerService;


