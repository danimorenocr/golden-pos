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
    width: 1024,
    height: 768,
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
  writeLog(`Descargando actualización de imágenes de Docker (pull) desde: ${dockerCwd}`);
  
  // Primero actualizar las imágenes de GitHub Container Registry
  const pullProcess = spawn('docker', ['compose', 'pull'], { cwd: dockerCwd, shell: true });

  pullProcess.stdout.on('data', (data) => {
    const message = data.toString();
    writeLog(`[DOCKER PULL STDOUT] ${message}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('docker-status', message);
    }
  });

  pullProcess.stderr.on('data', (data) => {
    const message = data.toString();
    writeLog(`[DOCKER PULL STDERR] ${message}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('docker-status', message);
    }
  });

  pullProcess.on('close', (pullCode) => {
    writeLog(`[DOCKER PULL CLOSE] docker compose pull finalizó con código ${pullCode}`);
    writeLog(`Iniciando contenedores con Docker Compose en: ${dockerCwd}`);

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

function verificarUrl(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      if (res.statusCode === 200) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    req.on('error', () => {
      resolve(false);
    });
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

// Función recursiva para verificar si el Frontend y los Microservicios ya están listos
let intentos = 0;
async function verificarServicio() {
  intentos++;
  writeLog(`Verificando servicios (Intento #${intentos})...`);
  
  const frontendReady = await verificarUrl('http://localhost');
  if (!frontendReady) {
    writeLog(`Frontend no disponible aún en http://localhost. Reintentando en 2 segundos...`);
    setTimeout(verificarServicio, 2000);
    return;
  }
  
  writeLog(`Frontend detectado. Verificando estado de los microservicios (Auth, Inventory, Sales) a través del Gateway...`);
  const authReady = await verificarUrl('http://localhost:3000/auth/health');
  const inventoryReady = await verificarUrl('http://localhost:3000/inventory/health');
  const salesReady = await verificarUrl('http://localhost:3000/sale/health');
  
  if (authReady && inventoryReady && salesReady) {
    writeLog(`¡Todos los contenedores, microservicios y semillas (seeds) están listos! Redirigiendo a http://localhost...`);
    mainWindow.loadURL('http://localhost');
  } else {
    writeLog(`Esperando inicialización de microservicios: Auth=${authReady ? 'LISTO' : 'ESPERANDO'}, Inventory=${inventoryReady ? 'LISTO' : 'ESPERANDO'}, Sales=${salesReady ? 'LISTO' : 'ESPERANDO'}. Reintentando en 2 segundos...`);
    setTimeout(verificarServicio, 2000);
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  // En Windows/Linux cerramos la app por completo
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

