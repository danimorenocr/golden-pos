const { app, BrowserWindow } = require('electron');
const path = require('path');
const { exec, spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

let mainWindow;
let logFilePath;

function writeLog(message) {
  const timestamp = new Date().toISOString();
  const formattedMessage = `[${timestamp}] ${message}\n`;
  console.log(message);
  if (logFilePath) {
    try {
      fs.appendFileSync(logFilePath, formattedMessage);
    } catch (err) {
      console.error("No se pudo escribir en el archivo de log:", err);
    }
  }
}

function createWindow() {
  logFilePath = path.join(app.getPath('userData'), 'app-debug.log');
  
  // Limpiar el archivo de log anterior al arrancar
  try {
    fs.writeFileSync(logFilePath, `--- INICIO DE APLICACIÓN --- \n`);
  } catch (e) {
    console.error("Error al inicializar archivo de log:", e);
  }

  writeLog(`Ruta del archivo de log: ${logFilePath}`);
  writeLog(`Directorio de trabajo del proceso: ${process.cwd()}`);
  writeLog(`Plataforma: ${process.platform}`);
  writeLog(`Variables de entorno clave: PATH=${process.env.PATH}`);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false, // No la mostramos hasta que cargue el HTML correspondiente
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // 1. Mostrar la pantalla de carga inmediatamente
  mainWindow.loadFile('loading.html');
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Habilitar F12 para abrir DevTools en caso de errores en la interfaz
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      mainWindow.webContents.toggleDevTools();
    }
  });

  // Loguear errores si falla la carga de cualquier página
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    writeLog(`[ERROR LOAD] No se pudo cargar la URL: ${validatedURL}. Error: ${errorDescription} (${errorCode})`);
  });

  // 2. Levantar Docker Compose (vuelve una carpeta atrás en desarrollo o usa resources en producción)
  const dockerCwd = app.isPackaged 
    ? process.resourcesPath 
    : path.join(__dirname, '../');
  writeLog(`Iniciando Docker Compose desde: ${dockerCwd}`);
  
  const dockerProcess = spawn('docker', ['compose', 'up', '-d'], { cwd: dockerCwd, shell: true });

  dockerProcess.stdout.on('data', (data) => {
    const message = data.toString();
    writeLog(`[DOCKER STDOUT] ${message}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('docker-status', message);
    }
  });

  dockerProcess.stderr.on('data', (data) => {
    const message = data.toString();
    writeLog(`[DOCKER STDERR] ${message}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('docker-status', message);
    }
  });

  dockerProcess.on('error', (err) => {
    writeLog(`[ERROR DOCKER SPAWN] ${err.message}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('docker-error', err.message);
    }
  });

  dockerProcess.on('close', (code) => {
    writeLog(`[DOCKER CLOSE] docker compose exited with code ${code}`);
    if (code === 0) {
      writeLog(`[DOCKER SUCCESS] Docker Compose iniciado correctamente.`);
      verificarServicio();
    } else {
      writeLog(`[DOCKER FAILED] docker compose exited with non-zero code ${code}`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('docker-error', `Docker falló al iniciar (código ${code})`);
      }
    }
  });

  // 4. Detener Docker al cerrar la ventana de Electron
  mainWindow.on('closed', () => {
    writeLog("Cerrando ventana. Deteniendo Docker Compose...");
    exec('docker compose down', { cwd: dockerCwd }, (err, stdout, stderr) => {
      if (err) {
        writeLog(`[ERROR DOCKER DOWN] ${err.message}`);
      } else {
        writeLog("[DOCKER DOWN SUCCESS] Docker Compose detenido correctamente.");
      }
      mainWindow = null;
      app.quit();
    });
  });
}

// Función recursiva para verificar si el Frontend ya está listo
let intentos = 0;
function verificarServicio() {
  intentos++;
  writeLog(`Verificando servicio frontend en http://localhost... (Intento #${intentos})`);
  
  http.get('http://localhost', (res) => {
    // Si responde (cualquier código de estado), cargamos la URL real de la app
    writeLog(`¡Frontend detectado! Estado HTTP: ${res.statusCode}. Redirigiendo a http://localhost...`);
    mainWindow.loadURL('http://localhost');
  }).on('error', (err) => {
    // Si da error (puerto cerrado todavía), reintentamos en 1.5 segundos
    writeLog(`Frontend no disponible aún (Error: ${err.message}). Reintentando en 1.5 segundos...`);
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

