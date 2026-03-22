const { ipcMain } = require('electron');
const { Warehouses, Inventory, Serials, BOM, Barcodes } = require('../models');
const Lots = require('../models/lots');

function registerInventoryHandlers() {
  // Warehouses
  ipcMain.handle('get-warehouses', async () => {
    try {
      return Warehouses.getAll();
    } catch (e) {
      console.error('Error getting warehouses:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('create-warehouse', async (event, warehouse) => {
    try {
      return Warehouses.create(warehouse);
    } catch (e) {
      console.error('Error creating warehouse:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('update-warehouse', async (event, warehouse) => {
    try {
      return Warehouses.update(warehouse);
    } catch (e) {
      console.error('Error updating warehouse:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('delete-warehouse', async (event, id) => {
    try {
      return Warehouses.delete(id);
    } catch (e) {
      console.error('Error deleting warehouse:', e);
      return { error: e.message };
    }
  });

  // Stock
  ipcMain.handle('get-item-stock', async (event, itemId) => {
    try {
      return Inventory.getStockForItem(itemId);
    } catch (e) {
      console.error('Error getting item stock:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('set-reorder-point', async (event, itemId, warehouseId, reorderPoint) => {
    try {
      return Inventory.setReorderPoint(itemId, warehouseId, reorderPoint);
    } catch (e) {
      console.error('Error setting reorder point:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('get-reorder-list', async () => {
    try {
      return Inventory.getReorderList();
    } catch (e) {
      console.error('Error getting reorder list:', e);
      return { error: e.message };
    }
  });

  // Expiring lots within N days
  ipcMain.handle('list-expiring-lots', async (_e, days) => {
    try {
      return Lots.listExpiringWithin(Number(days) || 30);
    } catch (e) {
      console.error('Error listing expiring lots:', e);
      return { error: e.message };
    }
  });

  // Adjustments and transfers
  ipcMain.handle('adjust-inventory', async (event, itemId, warehouseId, quantity, reason) => {
    try {
      return Inventory.adjustStock(itemId, warehouseId, quantity, reason);
    } catch (e) {
      console.error('Error adjusting inventory:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('transfer-stock', async (event, itemId, fromWarehouseId, toWarehouseId, quantity, refType, refId) => {
    try {
      return Inventory.recordMovement(itemId, fromWarehouseId, toWarehouseId, quantity, refType, refId);
    } catch (e) {
      console.error('Error transferring stock:', e);
      return { error: e.message };
    }
  });

  // Serials
  ipcMain.handle('add-serial', async (event, itemId, serial, warehouseId) => {
    try {
      return Serials.addSerial(itemId, serial, warehouseId);
    } catch (e) {
      console.error('Error adding serial:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('assign-serial-warehouse', async (event, serial, warehouseId) => {
    try {
      return Serials.assignToWarehouse(serial, warehouseId);
    } catch (e) {
      console.error('Error assigning serial warehouse:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('update-serial-status', async (event, serial, status) => {
    try {
      return Serials.updateStatus(serial, status);
    } catch (e) {
      console.error('Error updating serial status:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('list-serials-by-item', async (event, itemId) => {
    try {
      return Serials.listByItem(itemId);
    } catch (e) {
      console.error('Error listing serials:', e);
      return { error: e.message };
    }
  });

  // BOM
  ipcMain.handle('create-bom', async (event, parentItemId, name) => {
    try {
      return BOM.createBom(parentItemId, name);
    } catch (e) {
      console.error('Error creating BOM:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('add-bom-component', async (event, bomId, componentItemId, quantity) => {
    try {
      return BOM.addComponent(bomId, componentItemId, quantity);
    } catch (e) {
      console.error('Error adding BOM component:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('remove-bom-component', async (event, componentId) => {
    try {
      return BOM.removeComponent(componentId);
    } catch (e) {
      console.error('Error removing BOM component:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('get-bom', async (event, bomId) => {
    try {
      return BOM.getBomWithComponents(bomId);
    } catch (e) {
      console.error('Error getting BOM:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('list-assemblies', async (event, searchTerm) => {
    try {
      return BOM.listAssemblies(searchTerm);
    } catch (e) {
      console.error('Error listing assemblies:', e);
      return { error: e.message };
    }
  });

  // Barcodes
  ipcMain.handle('add-barcode', async (event, itemId, code, symbology) => {
    try {
      return Barcodes.addBarcode(itemId, code, symbology);
    } catch (e) {
      console.error('Error adding barcode:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('get-barcodes-by-item', async (event, itemId) => {
    try {
      return Barcodes.getByItem(itemId);
    } catch (e) {
      console.error('Error getting barcodes:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('find-item-by-barcode', async (event, code) => {
    try {
      return Barcodes.getByCode(code);
    } catch (e) {
      console.error('Error finding barcode:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('delete-barcode', async (event, id) => {
    try {
      return Barcodes.delete(id);
    } catch (e) {
      console.error('Error deleting barcode:', e);
      return { error: e.message };
    }
  });

  // Lots
  ipcMain.handle('lot-add', async (_e, payload) => {
    try {
      return Lots.addLot(payload || {});
    } catch (e) { return { error: e.message }; }
  });
  ipcMain.handle('lot-adjust', async (_e, payload) => {
    try {
      return Lots.adjustLot(payload || {});
    } catch (e) { return { error: e.message }; }
  });
  ipcMain.handle('lot-assign-warehouse', async (_e, payload) => {
    try {
      return Lots.assignLotWarehouse(payload || {});
    } catch (e) { return { error: e.message }; }
  });
  ipcMain.handle('lot-list-by-item', async (_e, itemId) => {
    try {
      return Lots.listLotsByItem(itemId);
    } catch (e) { return { error: e.message }; }
  });
}

module.exports = registerInventoryHandlers;


