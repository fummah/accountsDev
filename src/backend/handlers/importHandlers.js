const { ipcMain } = require('electron');
const Customers = require('../models/customers');
const Products = require('../models/products');
const Invoices = require('../models/invoices');
const Expenses = require('../models/expenses');
const Payments = require('../models/payments');
const Suppliers = require('../models/suppliers');
const Company = require('../models/company');
const Vat = require('../models/vat');
const db = require('../models/dbmgr');

function simpleCsvParse(csvText) {
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
	const headers = parseLine(lines[0]).map(h=>h.toLowerCase().trim());
	const rows = lines.slice(1).map(parseLine);
	return { headers, rows };
}

function headerIndex(headers, candidates) {
	for (const c of candidates) {
		const idx = headers.indexOf(c.toLowerCase());
		if (idx >= 0) return idx;
	}
	return -1;
}

async function register() {
	// Import Customers from QuickBooks CSV export
	ipcMain.handle('import-customers-csv', async (_e, csvText, options = {}) => {
		try {
			const { headers, rows } = simpleCsvParse(csvText || '');
			if (!headers.length) return { success: false, error: 'empty_csv' };

			// Common QB headers (varies by locale/export)
			const idx = {
				displayName: headerIndex(headers, ['display name', 'customer', 'customer name', 'company']),
				firstName: headerIndex(headers, ['first name', 'firstname']),
				lastName: headerIndex(headers, ['last name', 'lastname']),
				email: headerIndex(headers, ['email', 'email address']),
				phone: headerIndex(headers, ['phone', 'phone number']),
				mobile: headerIndex(headers, ['mobile', 'mobile phone']),
				fax: headerIndex(headers, ['fax']),
				address1: headerIndex(headers, ['billing address line 1', 'bill addr1', 'address1', 'address line 1']),
				address2: headerIndex(headers, ['billing address line 2', 'bill addr2', 'address2', 'address line 2']),
				city: headerIndex(headers, ['billing city', 'bill city', 'city']),
				state: headerIndex(headers, ['billing state', 'bill state', 'state']),
				postal: headerIndex(headers, ['billing postal code', 'bill postal code', 'zip', 'postal code']),
				country: headerIndex(headers, ['billing country', 'country']),
				terms: headerIndex(headers, ['terms']),
				openingBalance: headerIndex(headers, ['open balance', 'opening balance', 'balance']),
				asOf: headerIndex(headers, ['open balance date', 'as of', 'as of date']),
				taxNumber: headerIndex(headers, ['tax number', 'vat number', 'tax id']),
			};

			let inserted = 0;
			for (const r of rows) {
				const val = (i) => (i >= 0 ? (r[i] || '').toString().trim() : '');
				const displayName = val(idx.displayName);
				const firstName = val(idx.firstName) || displayName.split(' ')[0] || '';
				const lastName = val(idx.lastName) || displayName.split(' ').slice(1).join(' ') || '';
				const email = val(idx.email);
				const phone = val(idx.phone);
				const mobile = val(idx.mobile) || phone;
				const fax = val(idx.fax);
				const address1 = val(idx.address1);
				const address2 = val(idx.address2);
				const city = val(idx.city);
				const state = val(idx.state);
				const postal = val(idx.postal);
				const country = val(idx.country) || '';
				const terms = val(idx.terms);
				const openingBalance = parseFloat(val(idx.openingBalance) || '0') || 0;
				const asOf = val(idx.asOf) || null;
				const taxNumber = val(idx.taxNumber);

				// insertCustomer expects many fields; use safe defaults
				const res = await Customers.insertCustomer(
					'', // title
					firstName || displayName || '',
					'', // middle_name
					lastName || '',
					'', // suffix
					email || '',
					displayName || (firstName + ' ' + lastName).trim(),
					displayName || '', // company_name
					phone || '',
					mobile || '',
					fax || '',
					'', // other
					'', // website
					address1 || '',
					address2 || '',
					city || '',
					state || '',
					postal || '',
					country || '',
					'', // payment_method
					terms || '',
					taxNumber || '',
					options.enteredBy || 'import',
					openingBalance,
					asOf,
					'Email', // delivery_option
					'en', // language
					'' // notes
				);
				if (res && res.success) inserted++;
			}

			return { success: true, inserted };
		} catch (e) {
			return { success: false, error: e.message };
		}
	});

	// Import Products/Services from QuickBooks CSV
	ipcMain.handle('import-products-csv', async (_e, csvText, options = {}) => {
		try {
			const { headers, rows } = simpleCsvParse(csvText || '');
			if (!headers.length) return { success: false, error: 'empty_csv' };
			const idx = {
				type: headerIndex(headers, ['type', 'product/service type', 'service type']),
				name: headerIndex(headers, ['name', 'item name']),
				sku: headerIndex(headers, ['sku', 'item sku']),
				category: headerIndex(headers, ['category']),
				description: headerIndex(headers, ['description']),
				price: headerIndex(headers, ['sales price/rate', 'sales price', 'rate', 'price']),
				incomeAccount: headerIndex(headers, ['income account', 'account']),
				tax: headerIndex(headers, ['tax code', 'tax', 'taxable']),
			};
			let inserted = 0, updated = 0;
			for (const r of rows) {
				const val = (i) => (i >= 0 ? (r[i] || '').toString().trim() : '');
				const name = val(idx.name);
				if (!name) continue;
				const sku = val(idx.sku);
				const type = val(idx.type) || 'service';
				const category = val(idx.category);
				const description = val(idx.description);
				const price = parseFloat(val(idx.price) || '0') || 0;
				const income_account = val(idx.incomeAccount);
				const tax = val(idx.tax);
				// Upsert by name or sku
				const existing = db.prepare(`SELECT id FROM products WHERE name=? OR (sku IS NOT NULL AND sku=?)`).get(name, sku || name);
				if (existing && existing.id) {
					try {
						await Products.updateProduct({ id: existing.id, type, name, sku, category, description, price, income_account, tax_inclusive: '', tax, isfromsupplier: '', });
						updated++;
					} catch {}
				} else {
					const res = await Products.insertProduct(type, name, sku || '', category || '', description || '', price, income_account || '', '', tax || '', '', options.enteredBy || 'import');
					if (res && res.success) inserted++;
				}
			}
			return { success: true, inserted, updated };
		} catch (e) {
			return { success: false, error: e.message };
		}
	});

	// Import Invoices (with lines) from QuickBooks CSV: group by Invoice Number
	ipcMain.handle('import-invoices-csv', async (_e, csvText, options = {}) => {
		try {
			const { headers, rows } = simpleCsvParse(csvText || '');
			if (!headers.length) return { success: false, error: 'empty_csv' };
			const idx = {
				invoiceNumber: headerIndex(headers, ['invoice number', 'no.', 'number']),
				customer: headerIndex(headers, ['customer', 'customer name', 'display name']),
				email: headerIndex(headers, ['email', 'email address']),
				date: headerIndex(headers, ['invoice date', 'date']),
				dueDate: headerIndex(headers, ['due date']),
				billingAddress1: headerIndex(headers, ['billing address line 1', 'bill addr1', 'billing address']),
				itemName: headerIndex(headers, ['product/service', 'item', 'product', 'service']),
				description: headerIndex(headers, ['description']),
				qty: headerIndex(headers, ['qty', 'quantity']),
				rate: headerIndex(headers, ['rate', 'price']),
				amount: headerIndex(headers, ['amount', 'line amount']),
				vat: headerIndex(headers, ['tax rate', 'vat rate', 'tax']),
				terms: headerIndex(headers, ['terms']),
				status: headerIndex(headers, ['status']),
			};
			// Group rows by invoice number
			const byInv = new Map();
			for (const r of rows) {
				const invNo = (idx.invoiceNumber >= 0 ? r[idx.invoiceNumber] : '').toString().trim();
				if (!invNo) continue;
				if (!byInv.has(invNo)) byInv.set(invNo, []);
				byInv.get(invNo).push(r);
			}
			let inserted = 0, skipped = 0;
			for (const [invNo, group] of byInv) {
				const head = group[0];
				const customerName = (idx.customer >= 0 ? head[idx.customer] : '').toString().trim();
				const email = (idx.email >= 0 ? head[idx.email] : '').toString().trim();
				const date = (idx.date >= 0 ? head[idx.date] : '').toString().trim();
				const dueDate = (idx.dueDate >= 0 ? head[idx.dueDate] : '').toString().trim();
				const billing_address = (idx.billingAddress1 >= 0 ? head[idx.billingAddress1] : '').toString().trim();
				const vatRate = parseFloat((idx.vat >= 0 ? head[idx.vat] : '0')) || 0;
				const terms = (idx.terms >= 0 ? head[idx.terms] : '').toString().trim();
				const status = ((idx.status >= 0 ? head[idx.status] : '') || 'Pending').toString().trim() || 'Pending';
				// find or create customer
				let cust = db.prepare(`SELECT id FROM customers WHERE display_name=? OR email=?`).get(customerName, email);
				if (!cust) {
					const res = await Customers.insertCustomer('', customerName || 'Unknown', '', '', '', email || '', customerName || '', customerName || '', '', '', '', '', '', billing_address || '', '', '', '', '', '', '', terms || '', '', options.enteredBy || 'import', 0, date || null, 'Email', 'en', '');
					if (res && res.success) {
						cust = db.prepare(`SELECT id FROM customers WHERE display_name=? ORDER BY id DESC LIMIT 1`).get(customerName);
					}
				}
				if (!cust || !cust.id) { skipped++; continue; }
				// Build invoice lines
				const lines = [];
				for (const r of group) {
					const name = (idx.itemName >= 0 ? r[idx.itemName] : '').toString().trim();
					const desc = (idx.description >= 0 ? r[idx.description] : '').toString().trim();
					const qty = parseFloat((idx.qty >= 0 ? r[idx.qty] : '1')) || 1;
					const rate = parseFloat((idx.rate >= 0 ? r[idx.rate] : '0')) || 0;
					const amount = parseFloat((idx.amount >= 0 ? r[idx.amount] : (qty * rate).toString())) || (qty * rate);
					// find or create product
					let prod = null;
					if (name) prod = db.prepare(`SELECT id FROM products WHERE name=?`).get(name);
					if (!prod && name) {
						await Products.insertProduct('service', name, '', '', desc, rate || amount, '', '', '', '', options.enteredBy || 'import');
						prod = db.prepare(`SELECT id FROM products WHERE name=?`).get(name);
					}
					lines.push({
						product: prod?.id || null,
						description: desc || name || '',
						quantity: qty,
						rate: rate || amount,
						amount
					});
				}
				// Insert invoice
				const res = await Invoices.insertInvoice(
					cust.id,
					email || '',
					'',
					billing_address || '',
					terms || '',
					date || '',
					dueDate || '',
					'', // message
					'', // statement_message
					invNo,
					options.enteredBy || 'import',
					vatRate,
					status || 'Pending',
					lines
				);
				if (res && res.success) inserted++;
			}
			return { success: true, inserted, skipped };
		} catch (e) {
			return { success: false, error: e.message };
		}
	});

	// Import Payments from QuickBooks CSV
	ipcMain.handle('import-payments-csv', async (_e, csvText, options = {}) => {
		try {
			const { headers, rows } = simpleCsvParse(csvText || '');
			if (!headers.length) return { success: false, error: 'empty_csv' };
			const idx = {
				invoiceNumber: headerIndex(headers, ['invoice number', 'inv no', 'no.', 'number']),
				customer: headerIndex(headers, ['customer', 'customer name']),
				amount: headerIndex(headers, ['amount', 'payment amount', 'paid amount']),
				date: headerIndex(headers, ['date', 'payment date']),
				method: headerIndex(headers, ['payment method', 'method']),
			};
			let inserted = 0, skipped = 0;
			for (const r of rows) {
				const invNo = (idx.invoiceNumber >= 0 ? r[idx.invoiceNumber] : '').toString().trim();
				const amount = parseFloat((idx.amount >= 0 ? r[idx.amount] : '0')) || 0;
				const date = (idx.date >= 0 ? r[idx.date] : '').toString().trim();
				const method = (idx.method >= 0 ? r[idx.method] : '').toString().trim();
				let invoice = null;
				if (invNo) invoice = db.prepare(`SELECT id, balance FROM invoices WHERE number=?`).get(invNo);
				if (!invoice) {
					// fallback by customer latest open? skip to avoid mismatches
					skipped++; continue;
				}
				// Insert payment
				Payments.create({ invoiceId: invoice.id, amount, paymentMethod: method || 'Imported', date: date || null });
				// Update invoice balance/status
				db.prepare(`UPDATE invoices SET balance = MAX(0, COALESCE(balance,0) - ?), status = CASE WHEN MAX(0, COALESCE(balance,0) - ?) <= 0 THEN 'Paid' ELSE status END WHERE id = ?`)
					.run(amount, amount, invoice.id);
				inserted++;
			}
			return { success: true, inserted, skipped };
		} catch (e) {
			return { success: false, error: e.message };
		}
	});

	// Import Unpaid Bills (as supplier expenses with Pending status)
	ipcMain.handle('import-bills-csv', async (_e, csvText, options = {}) => {
		try {
			const { headers, rows } = simpleCsvParse(csvText || '');
			if (!headers.length) return { success: false, error: 'empty_csv' };
			const idx = {
				vendor: headerIndex(headers, ['vendor', 'supplier', 'vendor name']),
				ref: headerIndex(headers, ['bill no', 'reference', 'ref no', 'bill number']),
				date: headerIndex(headers, ['bill date', 'date']),
				dueDate: headerIndex(headers, ['due date']),
				item: headerIndex(headers, ['item', 'product/service', 'expense account']),
				description: headerIndex(headers, ['description', 'memo']),
				amount: headerIndex(headers, ['amount', 'line amount']),
				category: headerIndex(headers, ['category']),
				paymentAccount: headerIndex(headers, ['ap account', 'a/p account', 'payment account']),
			};
			// group per bill number if provided, else per vendor/date aggregation
			const keyOf = (r) => {
				const ref = (idx.ref >= 0 ? r[idx.ref] : '').toString().trim();
				const vendor = (idx.vendor >= 0 ? r[idx.vendor] : '').toString().trim();
				const date = (idx.date >= 0 ? r[idx.date] : '').toString().trim();
				return ref || `${vendor}|${date}`;
			};
			const groups = new Map();
			for (const r of rows) {
				const k = keyOf(r);
				if (!groups.has(k)) groups.set(k, []);
				groups.get(k).push(r);
			}
			let inserted = 0, skipped = 0;
			for (const [k, group] of groups) {
				const head = group[0];
				const vendorName = (idx.vendor >= 0 ? head[idx.vendor] : '').toString().trim();
				const ref_no = (idx.ref >= 0 ? head[idx.ref] : '').toString().trim();
				const payment_date = (idx.date >= 0 ? head[idx.date] : '').toString().trim();
				const payment_account = (idx.paymentAccount >= 0 ? head[idx.paymentAccount] : 'A/P').toString().trim() || 'A/P';
				// find or create supplier
				let sup = db.prepare(`SELECT id FROM suppliers WHERE display_name=? OR company_name=?`).get(vendorName, vendorName);
				if (!sup) {
					const res = await Suppliers.insertSupplier('', vendorName || 'Vendor', '', '', '', '', vendorName || 'Vendor', vendorName || 'Vendor', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 0, payment_date || null, options.enteredBy || 'import', '');
					if (res && res.success) {
						sup = db.prepare(`SELECT id FROM suppliers WHERE display_name=? ORDER BY id DESC LIMIT 1`).get(vendorName);
					}
				}
				if (!sup || !sup.id) { skipped++; continue; }
				// build lines
				const expenseLines = [];
				for (const r of group) {
					const cat = (idx.category >= 0 ? r[idx.category] : '').toString().trim() || (idx.item >= 0 ? r[idx.item] : '').toString().trim() || 'Expense';
					const desc = (idx.description >= 0 ? r[idx.description] : '').toString().trim();
					const amount = parseFloat((idx.amount >= 0 ? r[idx.amount] : '0')) || 0;
					if (amount === 0) continue;
					expenseLines.push({ category: cat || 'Expense', description: desc || cat, amount });
				}
				if (expenseLines.length === 0) { skipped++; continue; }
				const res = await Expenses.insertExpense(
					sup.id,
					payment_account,
					payment_date || null,
					'Imported',
					ref_no || '',
					'supplier',
					options.enteredBy || 'import',
					'Pending',
					expenseLines
				);
				if (res && res.success) inserted++;
			}
			return { success: true, inserted, skipped };
		} catch (e) {
			return { success: false, error: e.message };
		}
	});

	// Import customer balances (if provided as a separate CSV)
	ipcMain.handle('import-customer-balances-csv', async (_e, csvText, options = {}) => {
		try {
			const { headers, rows } = simpleCsvParse(csvText || '');
			if (!headers.length) return { success: false, error: 'empty_csv' };
			const idx = {
				customer: headerIndex(headers, ['customer', 'customer name', 'display name']),
				openBalance: headerIndex(headers, ['open balance', 'balance', 'amount due']),
				asOf: headerIndex(headers, ['as of', 'as of date', 'date']),
			};
			let updated = 0, skipped = 0;
			for (const r of rows) {
				const name = (idx.customer >= 0 ? r[idx.customer] : '').toString().trim();
				if (!name) { skipped++; continue; }
				const balance = parseFloat((idx.openBalance >= 0 ? r[idx.openBalance] : '0')) || 0;
				const asOf = (idx.asOf >= 0 ? r[idx.asOf] : '').toString().trim();
				const customer = db.prepare(`SELECT id FROM customers WHERE display_name=?`).get(name);
				if (!customer) { skipped++; continue; }
				db.prepare(`UPDATE customers SET opening_balance=?, as_of=? WHERE id=?`).run(balance, asOf || null, customer.id);
				updated++;
			}
			return { success: true, updated, skipped };
		} catch (e) {
			return { success: false, error: e.message };
		}
	});

	// Import My Company Settings (first data row)
	ipcMain.handle('import-company-csv', async (_e, csvText) => {
		try {
			const { headers, rows } = simpleCsvParse(csvText || '');
			if (!headers.length) return { success: false, error: 'empty_csv' };
			if (!rows.length) return { success: false, error: 'no_rows' };
			const idx = {
				name: headerIndex(headers, ['company name','name']),
				regNumber: headerIndex(headers, ['registration number','reg number','reg no','reg_number']),
				industry: headerIndex(headers, ['industry']),
				businessType: headerIndex(headers, ['business type','type']),
				address: headerIndex(headers, ['address','address line','street']),
				email: headerIndex(headers, ['email','email address']),
				phone: headerIndex(headers, ['phone','phone number']),
				logo: headerIndex(headers, ['logo','logo base64','logo url']),
				currency: headerIndex(headers, ['currency']),
				fyStart: headerIndex(headers, ['financial year start','fy start','fy_start']),
				vat: headerIndex(headers, ['vat rate','tax rate','vat']),
				terms: headerIndex(headers, ['default invoice terms','terms']),
				bank: headerIndex(headers, ['bank name']),
				accountNumber: headerIndex(headers, ['account number']),
				branchCode: headerIndex(headers, ['branch code','routing number']),
				payments: headerIndex(headers, ['payment methods','payments']),
			};
			const r = rows[0];
			const val = (i) => (i >= 0 ? (r[i] || '').toString().trim() : '');
			const payload = {
				name: val(idx.name),
				regNumber: val(idx.regNumber),
				industry: val(idx.industry),
				businessType: val(idx.businessType),
				address: val(idx.address),
				email: val(idx.email),
				phone: val(idx.phone),
				logo: val(idx.logo),
				currency: val(idx.currency),
				fyStart: val(idx.fyStart),
				vat: val(idx.vat) ? Number(val(idx.vat)) : null,
				terms: val(idx.terms) ? Number(val(idx.terms)) : null,
				bank: val(idx.bank),
				accountNumber: val(idx.accountNumber),
				branchCode: val(idx.branchCode),
				payments: val(idx.payments) ? val(idx.payments).split(/\s*,\s*/) : []
			};
			const res = Company.saveInfo(payload);
			return { success: !!res?.success, saved: payload };
		} catch (e) {
			return { success: false, error: e.message };
		}
	});

	// Import Vendors / Suppliers from QuickBooks CSV
	ipcMain.handle('import-suppliers-csv', async (_e, csvText, options = {}) => {
		try {
			const { headers, rows } = simpleCsvParse(csvText || '');
			if (!headers.length) return { success: false, error: 'empty_csv' };
			const idx = {
				displayName: headerIndex(headers, ['display name','vendor','vendor name','company']),
				firstName: headerIndex(headers, ['first name','firstname']),
				lastName: headerIndex(headers, ['last name','lastname']),
				email: headerIndex(headers, ['email','email address']),
				phone: headerIndex(headers, ['phone','phone number']),
				mobile: headerIndex(headers, ['mobile','mobile phone']),
				fax: headerIndex(headers, ['fax']),
				address1: headerIndex(headers, ['billing address line 1','address1','address line 1']),
				address2: headerIndex(headers, ['billing address line 2','address2','address line 2']),
				city: headerIndex(headers, ['billing city','city']),
				state: headerIndex(headers, ['billing state','state']),
				postal: headerIndex(headers, ['billing postal code','postal code','zip']),
				country: headerIndex(headers, ['billing country','country']),
				accountNumber: headerIndex(headers, ['account number','acct #']),
				terms: headerIndex(headers, ['terms','vendor terms']),
				openingBalance: headerIndex(headers, ['open balance','opening balance']),
				asOf: headerIndex(headers, ['open balance date','as of','as of date']),
				notes: headerIndex(headers, ['notes','memo']),
			};
			let inserted = 0, updated = 0;
			for (const r of rows) {
				const val = (i) => (i >= 0 ? (r[i] || '').toString().trim() : '');
				const display = val(idx.displayName);
				if (!display) continue;
				const first = val(idx.firstName) || display.split(' ')[0] || '';
				const last = val(idx.lastName) || display.split(' ').slice(1).join(' ') || '';
				const email = val(idx.email);
				const phone = val(idx.phone);
				const mobile = val(idx.mobile) || phone;
				const fax = val(idx.fax);
				const address1 = val(idx.address1);
				const address2 = val(idx.address2);
				const city = val(idx.city);
				const state = val(idx.state);
				const postal = val(idx.postal);
				const country = val(idx.country);
				const terms = val(idx.terms);
				const account_number = val(idx.accountNumber);
				const opening_balance = parseFloat(val(idx.openingBalance) || '0') || 0;
				const as_of = val(idx.asOf) || null;
				const notes = val(idx.notes) || '';

				// Upsert by display_name or email
				const existing = db.prepare(`SELECT id FROM suppliers WHERE display_name=? OR email=?`).get(display, email);
				if (existing && existing.id) {
					try {
						await Suppliers.updateSupplier({
							id: existing.id,
							title: '',
							first_name: first,
							middle_name: '',
							last_name: last,
							suffix: '',
							email,
							display_name: display,
							company_name: display,
							phone_number: phone,
							mobile_number: mobile,
							fax,
							other: '',
							website: '',
							address1,
							address2,
							city,
							state,
							postal_code: postal,
							country,
							supplier_terms: terms,
							business_number: '',
							account_number,
							expense_category: '',
							opening_balance,
							as_of,
							notes
						});
						updated++;
					} catch {}
				} else {
					const res = await Suppliers.insertSupplier(
						'', first, '', last, '', email, display, display, phone, mobile, fax, '', '', address1, address2, city, state, postal, country,
						terms, '', account_number, '', opening_balance, as_of, options.enteredBy || 'import', notes
					);
					if (res && res.success) inserted++;
				}
			}
			return { success: true, inserted, updated };
		} catch (e) {
			return { success: false, error: e.message };
		}
	});

	// Import VAT / Tax codes from CSV
	ipcMain.handle('import-vat-csv', async (_e, csvText, options = {}) => {
		try {
			const { headers, rows } = simpleCsvParse(csvText || '');
			if (!headers.length) return { success: false, error: 'empty_csv' };
			const idx = {
				name: headerIndex(headers, ['tax name','vat name','name','code']),
				rate: headerIndex(headers, ['rate','percentage','vat percentage','tax rate'])
			};
			let inserted = 0;
			for (const r of rows) {
				const name = (idx.name >= 0 ? r[idx.name] : '').toString().trim();
				const rate = parseFloat((idx.rate >= 0 ? r[idx.rate] : '0')) || 0;
				if (!name) continue;
				const existing = db.prepare(`SELECT id FROM vat WHERE vat_name=?`).get(name);
				if (existing && existing.id) {
					await Vat.updateVat({ id: existing.id, vat_name: name, vat_percentage: rate });
				} else {
					await Vat.insertVat(name, rate, options.enteredBy || 'import');
				}
				inserted++;
			}
			return { success: true, inserted };
		} catch (e) {
			return { success: false, error: e.message };
		}
	});
}

module.exports = register;


