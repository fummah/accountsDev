const { ipcMain } = require('electron');
const { Projects, Timesheets } = require('../models');

function registerProjectHandlers() {
  // Projects CRUD
  ipcMain.handle('get-projects', async () => {
    try {
      return Projects.list();
    } catch (e) {
      console.error('Error getting projects:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('create-project', async (event, project) => {
    try {
      return Projects.create(project);
    } catch (e) {
      console.error('Error creating project:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('update-project', async (event, project) => {
    try {
      return Projects.update(project);
    } catch (e) {
      console.error('Error updating project:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('delete-project', async (event, id) => {
    try {
      return Projects.delete(id);
    } catch (e) {
      console.error('Error deleting project:', e);
      return { error: e.message };
    }
  });

  // Job costing / Links
  ipcMain.handle('add-project-link', async (event, projectId, linkType, linkedId, direction, amount, costType) => {
    try {
      return Projects.addLink(projectId, linkType, linkedId, direction, amount, costType);
    } catch (e) {
      console.error('Error adding project link:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('list-project-links', async (event, projectId) => {
    try {
      return Projects.listLinks(projectId);
    } catch (e) {
      console.error('Error listing project links:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('get-project-profitability', async (event, projectId) => {
    try {
      return Projects.getProfitability(projectId);
    } catch (e) {
      console.error('Error getting project profitability:', e);
      return { error: e.message };
    }
  });

  // Timesheets / Time tracking
  ipcMain.handle('log-time', async (event, entry) => {
    try {
      return Timesheets.logTime(entry);
    } catch (e) {
      console.error('Error logging time:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('list-timesheets-by-project', async (event, projectId) => {
    try {
      return Timesheets.listByProject(projectId);
    } catch (e) {
      console.error('Error listing timesheets:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('delete-timesheet', async (event, id) => {
    try {
      return Timesheets.delete(id);
    } catch (e) {
      console.error('Error deleting timesheet:', e);
      return { error: e.message };
    }
  });

  // Project tasks for Gantt-style view
  try {
    const ProjectTasks = require('../models/projectTasks');
    ipcMain.handle('project-task-list', async (_e, projectId) => {
      try { return ProjectTasks.list(projectId); } catch (e) { return { error: e.message }; }
    });
    ipcMain.handle('project-task-create', async (_e, task) => {
      try { return ProjectTasks.create(task || {}); } catch (e) { return { error: e.message }; }
    });
    ipcMain.handle('project-task-update', async (_e, task) => {
      try { return ProjectTasks.update(task || {}); } catch (e) { return { error: e.message }; }
    });
    ipcMain.handle('project-task-delete', async (_e, id) => {
      try { return ProjectTasks.delete(id); } catch (e) { return { error: e.message }; }
    });
  } catch {}

  // Create invoice from unbilled timesheets
  ipcMain.handle('project-invoice-from-timesheets', async (_e, { projectId, entered_by='system', terms='NET 15', message='Time billing', vat=0 } = {}) => {
    try {
      const db = require('../models/dbmgr');
      const Projects = require('../models/projects');
      const Invoices = require('../models/invoices');
      const proj = Projects.getById(projectId);
      if (!proj || !proj.customerId) throw new Error('Project has no linked customer');
      const rows = db.prepare(`SELECT * FROM timesheets WHERE projectId=? AND COALESCE(billed,0)=0 ORDER BY workDate ASC`).all(projectId);
      if (!rows.length) return { success: false, error: 'No unbilled time' };
      const start = rows[0].workDate;
      const end = rows[rows.length-1].workDate;
      const invoiceLines = rows.map(r => ({
        product: 0,
        description: `Time ${r.workDate} (${Number(r.hours||0)}h @ ${Number(r.hourlyRate||0)})`,
        quantity: Number(r.hours||0),
        rate: Number(r.hourlyRate||0),
        amount: Number(r.hourlyRate||0)
      }));
      const res = await Invoices.insertInvoice(proj.customerId, null, 0, null, terms, start, end, message, null, null, entered_by, vat, 'Pending', invoiceLines);
      if (res && res.success) {
        db.prepare(`UPDATE timesheets SET billed=1 WHERE projectId=? AND COALESCE(billed,0)=0`).run(projectId);
        return { success: true, invoiceId: res.invoiceId };
      }
      return res;
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
}

module.exports = registerProjectHandlers;


