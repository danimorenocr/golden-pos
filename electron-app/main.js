const { app, BrowserWindow } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const http = require('http');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false, // No la mostramos hasta que cargue el HTML correspondiente
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // 1. Mostrar la pantalla de carga inmediatamente
  mainWindow.loadFile('loading.html');
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 2. Levantar Docker Compose (vuelve una carpeta atrás donde está el docker-compose.yml)
  console.log("Iniciando Docker Compose...");
  exec('docker compose up -d', { cwd: path.join(__dirname, '../') }, (err, stdout, stderr) => {
    if (err) {
      console.error("Error levantando Docker:", err);
      return;
    }
    // 3. Una vez ejecutado el comando, empezar a chequear si localhost:3000 ya responde
    verificarServicio();
  });

  // 4. Detener Docker al cerrar la ventana de Electron
  mainWindow.on('closed', () => {
    console.log("Cerrando ventana. Deteniendo Docker Compose...");
    exec('docker compose down', { cwd: path.join(__dirname, '../') }, (err, stdout, stderr) => {
      mainWindow = null;
      app.quit();
    });
  });
}

// Función recursiva para verificar si el Frontend ya está listo
function verificarServicio() {
  http.get('http://localhost:3000', (res) => {
    // Si responde (cualquier código de estado), cargamos la URL real de la app
    console.log("¡El frontend está listo! Redirigiendo...");
    mainWindow.loadURL('http://localhost');
  }).on('error', (err) => {
    // Si da error (puerto cerrado todavía), reintentamos en 1.5 segundos
    console.log("Esperando a que localhost:3000 encienda...");
    setTimeout(verificarServicio, 1500);
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  // En Windows/Linux cerramos la app por completo
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
