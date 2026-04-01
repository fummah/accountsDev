const { ipcMain } = require('electron');
const { CRM } = require('../models');

function registerCrmHandlers() {
  // ── Leads ──────────────────────────────────────────────────────────────────
  ipcMain.handle('crm-list-leads', async (event, filters) => {
    try { return CRM.listLeads(filters || {}); }
    catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('crm-get-lead', async (event, id) => {
    try { return CRM.getLead(id); }
    catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('crm-create-lead', async (event, lead) => {
    try { return CRM.createLead(lead); }
    catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('crm-update-lead', async (event, lead) => {
    try { return CRM.updateLead(lead); }
    catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('crm-update-lead-stage', async (event, id, stage) => {
    try { return CRM.updateLeadStage(id, stage); }
    catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('crm-bulk-update-stage', async (event, ids, stage) => {
    try { return CRM.bulkUpdateStage(ids, stage); }
    catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('crm-delete-lead', async (event, id) => {
    try { return CRM.deleteLead(id); }
    catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('crm-convert-lead', async (event, id, extraData) => {
    try { return CRM.convertToCustomer(id, extraData || {}); }
    catch (e) { return { error: e.message }; }
  });

  // ── Activities ─────────────────────────────────────────────────────────────
  ipcMain.handle('crm-list-activities', async (event, params) => {
    try { return CRM.listActivities(params || {}); }
    catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('crm-overdue-activities', async () => {
    try { return CRM.getOverdueActivities(); }
    catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('crm-upcoming-activities', async (event, days) => {
    try { return CRM.getUpcomingActivities(days || 7); }
    catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('crm-create-activity', async (event, activity) => {
    try { return CRM.createActivity(activity); }
    catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('crm-update-activity', async (event, activity) => {
    try { return CRM.updateActivity(activity); }
    catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('crm-delete-activity', async (event, id) => {
    try { return CRM.deleteActivity(id); }
    catch (e) { return { error: e.message }; }
  });

  // ── Quote linkage ──────────────────────────────────────────────────────────
  ipcMain.handle('crm-get-lead-quotes', async (event, leadId) => {
    try { return CRM.getLeadQuotes(leadId); }
    catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('crm-link-quote', async (event, leadId, quoteId) => {
    try { return CRM.linkQuote(leadId, quoteId); }
    catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('crm-create-quote-for-lead', async (event, leadId, quoteData, quoteLines) => {
    try { return CRM.createQuoteForLead(leadId, quoteData || {}, quoteLines || []); }
    catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('crm-get-lead-with-related', async (event, leadId) => {
    try { return CRM.getLeadWithRelated(leadId); }
    catch (e) { return { error: e.message }; }
  });

  // ── Reports & Stats ────────────────────────────────────────────────────────
  ipcMain.handle('crm-pipeline-stats', async () => {
    try { return CRM.getPipelineStats(); }
    catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('crm-reports', async () => {
    try { return CRM.getReports(); }
    catch (e) { return { error: e.message }; }
  });
}

module.exports = registerCrmHandlers;


