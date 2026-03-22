const { ipcMain } = require('electron');
const { CRM } = require('../models');

function registerCrmHandlers() {
  // Leads
  ipcMain.handle('crm-list-leads', async () => {
    try {
      return CRM.listLeads();
    } catch (e) {
      console.error('Error listing leads:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('crm-create-lead', async (event, lead) => {
    try {
      return CRM.createLead(lead);
    } catch (e) {
      console.error('Error creating lead:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('crm-update-lead', async (event, lead) => {
    try {
      return CRM.updateLead(lead);
    } catch (e) {
      console.error('Error updating lead:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('crm-delete-lead', async (event, id) => {
    try {
      return CRM.deleteLead(id);
    } catch (e) {
      console.error('Error deleting lead:', e);
      return { error: e.message };
    }
  });

  // Activities
  ipcMain.handle('crm-list-activities', async (event, params) => {
    try {
      return CRM.listActivities(params || {});
    } catch (e) {
      console.error('Error listing activities:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('crm-create-activity', async (event, activity) => {
    try {
      return CRM.createActivity(activity);
    } catch (e) {
      console.error('Error creating activity:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('crm-update-activity', async (event, activity) => {
    try {
      return CRM.updateActivity(activity);
    } catch (e) {
      console.error('Error updating activity:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('crm-delete-activity', async (event, id) => {
    try {
      return CRM.deleteActivity(id);
    } catch (e) {
      console.error('Error deleting activity:', e);
      return { error: e.message };
    }
  });
}

module.exports = registerCrmHandlers;


