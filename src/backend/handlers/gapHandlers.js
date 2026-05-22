const { ipcMain } = require('electron');

const safeHandle = (channel, handler) => {
  try { ipcMain.handle(channel, handler); } catch (e) { console.error(`Failed to register ${channel}:`, e.message); }
};

module.exports = function registerGapHandlers() {
  const TaxForms = require('../models/taxForms');
  const TaxFiling = require('../models/taxFiling');
  const TimeAttendance = require('../models/timeAttendance');
  const DirectDeposit = require('../models/directDeposit');
  const PickPackShip = require('../models/pickPackShip');
  const PricingRules = require('../models/pricingRules');
  const Consolidation = require('../models/consolidation');
  const JurisdictionTax = require('../models/jurisdictionTax');
  const HelpSystem = require('../models/helpSystem');
  const I18n = require('../models/i18n');
  const Settings = require('../models/settings');

  // === #1 Setup Wizard ===
  safeHandle('setup-wizard-status', async () => {
    return Settings.get('setup_wizard_completed') || false;
  });
  safeHandle('setup-wizard-complete', async (_e, stepData) => {
    Settings.set('setup_wizard_completed', true);
    if (stepData) Settings.set('setup_wizard_data', stepData);
    return { success: true };
  });
  safeHandle('setup-wizard-get-data', async () => {
    return Settings.get('setup_wizard_data') || {};
  });

  // === #2 Statutory Tax Forms ===
  safeHandle('tax-form-generate', async (_e, params) => {
    try { return TaxForms.generate(params); } catch (e) { return { error: e.message }; }
  });
  safeHandle('tax-form-list', async (_e, filters) => {
    try { return TaxForms.list(filters || {}); } catch (e) { return { error: e.message }; }
  });
  safeHandle('tax-form-get', async (_e, id) => {
    return TaxForms.get(id);
  });
  safeHandle('tax-form-update-status', async (_e, id, status) => {
    return TaxForms.updateStatus(id, status);
  });
  safeHandle('tax-form-delete', async (_e, id) => {
    return TaxForms.delete(id);
  });
  safeHandle('tax-form-html', async (_e, id) => {
    return TaxForms.generateHtml(id);
  });

  // === #3 Electronic Tax Filing ===
  safeHandle('tax-filing-generate', async (_e, params) => {
    try { return TaxFiling.generateFilingFile(params); } catch (e) { return { error: e.message }; }
  });
  safeHandle('tax-filing-list', async (_e, filters) => {
    return TaxFiling.list(filters || {});
  });
  safeHandle('tax-filing-get', async (_e, id) => {
    return TaxFiling.get(id);
  });
  safeHandle('tax-filing-submit', async (_e, id, confirmationNumber) => {
    return TaxFiling.markSubmitted(id, confirmationNumber);
  });
  safeHandle('tax-filing-delete', async (_e, id) => {
    return TaxFiling.delete(id);
  });

  // === #5 Time & Attendance ===
  safeHandle('attendance-clock-in', async (_e, employeeId, workType, notes) => {
    try { return TimeAttendance.clockIn(employeeId, workType, notes); } catch (e) { return { error: e.message }; }
  });
  safeHandle('attendance-clock-out', async (_e, id) => {
    return TimeAttendance.clockOut(id);
  });
  safeHandle('attendance-active', async (_e, employeeId) => {
    return TimeAttendance.getActiveClockIn(employeeId);
  });
  safeHandle('attendance-list', async (_e, employeeId, startDate, endDate) => {
    if (employeeId) return TimeAttendance.listByEmployee(employeeId, startDate, endDate);
    return TimeAttendance.listAll(startDate, endDate);
  });
  safeHandle('attendance-approve', async (_e, id, approvedBy) => {
    return TimeAttendance.approve(id, approvedBy);
  });
  safeHandle('attendance-calculate', async (_e, employeeId, startDate, endDate) => {
    try { return TimeAttendance.calculateHours(employeeId, startDate, endDate); } catch (e) { return { error: e.message }; }
  });
  safeHandle('attendance-link-payroll', async (_e, employeeId, payrollRunId, startDate, endDate) => {
    return TimeAttendance.linkToPayroll(employeeId, payrollRunId, startDate, endDate);
  });
  safeHandle('attendance-policy-get', async () => {
    return TimeAttendance.getPolicy();
  });
  safeHandle('attendance-policy-save', async (_e, policy) => {
    return TimeAttendance.savePolicy(policy);
  });
  safeHandle('attendance-delete', async (_e, id) => {
    return TimeAttendance.delete(id);
  });

  // === #7 Direct Deposit ===
  safeHandle('direct-deposit-save-bank', async (_e, data) => {
    try { return DirectDeposit.saveEmployeeBank(data); } catch (e) { return { error: e.message }; }
  });
  safeHandle('direct-deposit-get-bank', async (_e, employeeId) => {
    return DirectDeposit.getEmployeeBank(employeeId);
  });
  safeHandle('direct-deposit-generate-ach', async (_e, payrollRunId, companyInfo) => {
    try { return DirectDeposit.generateACH(payrollRunId, companyInfo); } catch (e) { return { error: e.message }; }
  });
  safeHandle('direct-deposit-generate-bacs', async (_e, payrollRunId, companyInfo) => {
    try { return DirectDeposit.generateBACS(payrollRunId, companyInfo); } catch (e) { return { error: e.message }; }
  });
  safeHandle('direct-deposit-generate-eft', async (_e, payrollRunId, companyInfo) => {
    try { return DirectDeposit.generateEFT(payrollRunId, companyInfo); } catch (e) { return { error: e.message }; }
  });
  safeHandle('direct-deposit-list', async (_e, limit) => {
    return DirectDeposit.list(limit);
  });
  safeHandle('direct-deposit-get', async (_e, id) => {
    return DirectDeposit.get(id);
  });
  safeHandle('direct-deposit-submit', async (_e, id) => {
    return DirectDeposit.markSubmitted(id);
  });

  // === #8 Jurisdiction Tax Engine ===
  safeHandle('jurisdiction-tax-list', async (_e, jurisdiction) => {
    if (jurisdiction) return JurisdictionTax.listByJurisdiction(jurisdiction);
    return JurisdictionTax.listAll();
  });
  safeHandle('jurisdiction-tax-jurisdictions', async () => {
    return JurisdictionTax.listJurisdictions();
  });
  safeHandle('jurisdiction-tax-save', async (_e, rule) => {
    try { return JurisdictionTax.saveRule(rule); } catch (e) { return { error: e.message }; }
  });
  safeHandle('jurisdiction-tax-delete', async (_e, id) => {
    return JurisdictionTax.deleteRule(id);
  });
  safeHandle('jurisdiction-tax-calculate', async (_e, jurisdiction, taxType, amount, options) => {
    try { return JurisdictionTax.calculateTax(jurisdiction, taxType, amount, options); } catch (e) { return { error: e.message }; }
  });

  // === #10 Consolidated Reports ===
  safeHandle('consolidation-mappings', async (_e, entityId) => {
    return Consolidation.listMappings(entityId);
  });
  safeHandle('consolidation-mapping-save', async (_e, mapping) => {
    try { return Consolidation.saveMapping(mapping); } catch (e) { return { error: e.message }; }
  });
  safeHandle('consolidation-mapping-delete', async (_e, id) => {
    return Consolidation.deleteMapping(id);
  });
  safeHandle('consolidation-auto-map', async (_e, entityId) => {
    try { return Consolidation.autoMapAccounts(entityId); } catch (e) { return { error: e.message }; }
  });
  safeHandle('consolidation-generate', async (_e, startDate, endDate, entityIds) => {
    try { return Consolidation.generateConsolidated(startDate, endDate, entityIds); } catch (e) { return { error: e.message }; }
  });
  safeHandle('consolidation-runs', async (_e, limit) => {
    return Consolidation.listRuns(limit);
  });
  safeHandle('consolidation-run-get', async (_e, id) => {
    return Consolidation.getRun(id);
  });
  safeHandle('consolidation-run-delete', async (_e, id) => {
    return Consolidation.deleteRun(id);
  });

  // === #13 Pricing Rules ===
  safeHandle('pricing-tiers-list', async () => {
    return PricingRules.listTiers();
  });
  safeHandle('pricing-tier-save', async (_e, tier) => {
    try { return PricingRules.saveTier(tier); } catch (e) { return { error: e.message }; }
  });
  safeHandle('pricing-tier-delete', async (_e, id) => {
    return PricingRules.deleteTier(id);
  });
  safeHandle('pricing-customer-tier-assign', async (_e, customerId, tierId) => {
    return PricingRules.assignCustomerTier(customerId, tierId);
  });
  safeHandle('pricing-customer-tier-get', async (_e, customerId) => {
    return PricingRules.getCustomerTier(customerId);
  });
  safeHandle('pricing-rules-list', async () => {
    return PricingRules.listRules();
  });
  safeHandle('pricing-rule-save', async (_e, rule) => {
    try { return PricingRules.saveRule(rule); } catch (e) { return { error: e.message }; }
  });
  safeHandle('pricing-rule-delete', async (_e, id) => {
    return PricingRules.deleteRule(id);
  });
  safeHandle('pricing-calculate', async (_e, itemId, quantity, customerId, date) => {
    try { return PricingRules.calculatePrice(itemId, quantity, customerId, date); } catch (e) { return { error: e.message }; }
  });

  // === #14 Pick Pack Ship ===
  safeHandle('pps-order-create', async (_e, data, lines) => {
    try { return PickPackShip.createOrder(data, lines); } catch (e) { return { error: e.message }; }
  });
  safeHandle('pps-order-get', async (_e, id) => {
    return PickPackShip.getOrder(id);
  });
  safeHandle('pps-order-list', async (_e, status) => {
    return PickPackShip.listOrders(status);
  });
  safeHandle('pps-order-status', async (_e, id, status) => {
    return PickPackShip.updateOrderStatus(id, status);
  });
  safeHandle('pps-order-delete', async (_e, id) => {
    return PickPackShip.deleteOrder(id);
  });
  safeHandle('pps-pick-create', async (_e, orderId, assignedTo) => {
    try { return PickPackShip.createPickList(orderId, assignedTo); } catch (e) { return { error: e.message }; }
  });
  safeHandle('pps-pick-get', async (_e, id) => {
    return PickPackShip.getPickList(id);
  });
  safeHandle('pps-pick-confirm', async (_e, pickListId, pickedItems) => {
    try { return PickPackShip.confirmPick(pickListId, pickedItems); } catch (e) { return { error: e.message }; }
  });
  safeHandle('pps-pack-create', async (_e, orderId, pickListId, packedBy, boxCount, weight, notes) => {
    try { return PickPackShip.createPackingSlip(orderId, pickListId, packedBy, boxCount, weight, notes); } catch (e) { return { error: e.message }; }
  });
  safeHandle('pps-pack-get', async (_e, id) => {
    return PickPackShip.getPackingSlip(id);
  });
  safeHandle('pps-ship-create', async (_e, data) => {
    try { return PickPackShip.createShipment(data); } catch (e) { return { error: e.message }; }
  });
  safeHandle('pps-ship-list', async (_e, orderId) => {
    return PickPackShip.listShipments(orderId);
  });
  safeHandle('pps-ship-deliver', async (_e, shipmentId, deliveryDate) => {
    try { return PickPackShip.confirmDelivery(shipmentId, deliveryDate); } catch (e) { return { error: e.message }; }
  });

  // === #6 i18n ===
  safeHandle('i18n-locales', async () => {
    return I18n.listLocales();
  });
  safeHandle('i18n-locales-active', async () => {
    return I18n.listActiveLocales();
  });
  safeHandle('i18n-locale-toggle', async (_e, code, active) => {
    return I18n.toggleLocale(code, active);
  });
  safeHandle('i18n-translations', async (_e, locale, namespace) => {
    return I18n.getTranslations(locale, namespace);
  });
  safeHandle('i18n-translations-all', async (_e, locale) => {
    return I18n.getAllTranslationsForLocale(locale);
  });
  safeHandle('i18n-translation-set', async (_e, locale, namespace, key, value) => {
    return I18n.setTranslation(locale, namespace, key, value);
  });
  safeHandle('i18n-translations-bulk', async (_e, locale, namespace, translations) => {
    return I18n.bulkSetTranslations(locale, namespace, translations);
  });
  safeHandle('i18n-export', async (_e, locale) => {
    return I18n.exportLocale(locale);
  });
  safeHandle('i18n-import', async (_e, locale, entries) => {
    return I18n.importLocale(locale, entries);
  });
  safeHandle('i18n-coverage', async (_e, locale) => {
    return I18n.getCoverage(locale);
  });

  // === #15 Industry Report Templates (extension of existing reportTemplates) ===
  safeHandle('industry-templates-seed', async (_e, industry) => {
    const ReportTemplates = require('../models/reportTemplates');
    const templates = {
      'non-profit': [
        { name: 'Statement of Activities', entity: 'transactions', fields: ['date', 'description', 'amount', 'type'], filters: {}, dateField: 'date' },
        { name: 'Donor Contributions Report', entity: 'customers', fields: ['display_name', 'opening_balance', 'terms'], filters: {}, dateField: null },
        { name: 'Fund Balance Report', entity: 'chart_of_accounts', fields: ['name', 'type', 'balance'], filters: { type: 'Equity' }, dateField: null },
        { name: 'Grant Tracking Report', entity: 'projects', fields: ['name', 'status', 'budget', 'actual'], filters: {}, dateField: 'startDate' },
      ],
      'construction': [
        { name: 'Job Cost Summary', entity: 'projects', fields: ['name', 'budget', 'actual', 'status'], filters: {}, dateField: 'startDate' },
        { name: 'Work In Progress (WIP)', entity: 'projects', fields: ['name', 'budget', 'actual', 'percentComplete'], filters: { status: 'In Progress' }, dateField: null },
        { name: 'Change Order Log', entity: 'transactions', fields: ['date', 'description', 'amount', 'reference'], filters: { type: 'change_order' }, dateField: 'date' },
        { name: 'Subcontractor Payments', entity: 'expenses', fields: ['payee', 'amount', 'payment_date', 'category'], filters: { category: 'Subcontractor' }, dateField: 'payment_date' },
      ],
      'retail': [
        { name: 'Daily Sales Summary', entity: 'pos_sales', fields: ['date', 'total', 'paymentType'], filters: {}, dateField: 'date' },
        { name: 'Product Sales by Category', entity: 'products', fields: ['name', 'category', 'price'], filters: {}, dateField: null },
        { name: 'Inventory Valuation', entity: 'items', fields: ['name', 'code', 'quantity', 'cost'], filters: {}, dateField: null },
        { name: 'Cash Register Report', entity: 'pos_sessions', fields: ['openedAt', 'closedAt', 'openingAmount', 'closingAmount'], filters: {}, dateField: 'openedAt' },
      ],
      'manufacturing': [
        { name: 'BOM Cost Analysis', entity: 'boms', fields: ['name', 'parentName', 'componentCount'], filters: {}, dateField: null },
        { name: 'Production Order Status', entity: 'sales_orders', fields: ['order_number', 'status', 'total'], filters: {}, dateField: 'order_date' },
        { name: 'Raw Material Usage', entity: 'items', fields: ['name', 'code', 'quantity'], filters: { type: 'raw_material' }, dateField: null },
        { name: 'Finished Goods Inventory', entity: 'items', fields: ['name', 'code', 'quantity', 'cost'], filters: { type: 'finished' }, dateField: null },
      ],
      'professional-services': [
        { name: 'Billable Hours Summary', entity: 'timesheets', fields: ['employeeName', 'hours', 'hourlyRate', 'amount'], filters: {}, dateField: 'workDate' },
        { name: 'Client Profitability', entity: 'projects', fields: ['name', 'budget', 'actual', 'revenue'], filters: {}, dateField: null },
        { name: 'Utilization Rate', entity: 'employees', fields: ['first_name', 'last_name', 'billableHours', 'totalHours'], filters: {}, dateField: null },
        { name: 'Accounts Receivable Aging', entity: 'invoices', fields: ['number', 'customer', 'total', 'balance', 'daysOverdue'], filters: {}, dateField: 'start_date' },
      ],
    };
    const industryTemplates = templates[industry];
    if (!industryTemplates) return { error: 'Unknown industry: ' + industry };
    let created = 0;
    for (const t of industryTemplates) {
      try {
        ReportTemplates.save({ name: `[${industry}] ${t.name}`, entity: t.entity, fields: t.fields, filters: t.filters, dateField: t.dateField });
        created++;
      } catch {}
    }
    return { success: true, created };
  });
  safeHandle('industry-templates-list', async () => {
    return ['non-profit', 'construction', 'retail', 'manufacturing', 'professional-services'];
  });

  // === #18 Help System ===
  safeHandle('help-search', async (_e, query) => {
    return HelpSystem.searchArticles(query);
  });
  safeHandle('help-article', async (_e, id) => {
    return HelpSystem.getArticle(id);
  });
  safeHandle('help-context', async (_e, contextKey) => {
    return HelpSystem.getArticleByContext(contextKey);
  });
  safeHandle('help-article-save', async (_e, article) => {
    return HelpSystem.saveArticle(article);
  });

  // === #19 Training Module ===
  safeHandle('training-modules', async () => {
    return HelpSystem.listTrainingModules();
  });
  safeHandle('training-steps', async (_e, module) => {
    return HelpSystem.getTrainingModule(module);
  });
  safeHandle('training-progress', async (_e, userId, module) => {
    return HelpSystem.getProgress(userId, module);
  });
  safeHandle('training-progress-update', async (_e, userId, module, step) => {
    return HelpSystem.updateProgress(userId, module, step);
  });
  safeHandle('training-progress-all', async (_e, userId) => {
    return HelpSystem.getAllProgress(userId);
  });

  console.log('Gap feature handlers registered successfully');
};
