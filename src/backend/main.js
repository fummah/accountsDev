// main.js or index.js in your Electron project

const { app, BrowserWindow } = require('electron');
const path = require('path');
const registerIpcHandlers = require('./handlers/ipcHandlers'); 

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // We'll create preload.js next
      contextIsolation: true,
      enableRemoteModule: false,
    },
  });
  win.loadURL('http://localhost:3000'); // Or `win.loadFile('path/to/index.html')` if using a local file
}

app.whenReady().then(() => {
  createWindow();
  registerIpcHandlers(); // Register all IPC handlers
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
