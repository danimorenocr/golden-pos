const { app, BrowserWindow } = require('electron');
const { autoUpdater } = require('electron-updater');
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

  // Configuración de permisos y auto-selección de dispositivos para WebUSB y Web Serial
  mainWindow.webContents.session.on('select-usb-device', (event, details, callback) => {
    event.preventDefault();
    if (details.deviceList && details.deviceList.length > 0) {
      writeLog(`[USB] Auto-seleccionando dispositivo USB: ${details.deviceList[0].deviceName || 'Impresora/Caja'}`);
      callback(details.deviceList[0].deviceId);
    } else {
      callback();
    }
  });

  mainWindow.webContents.session.on('select-serial-port', (event, portList, webContents, callback) => {
    event.preventDefault();
    if (portList && portList.length > 0) {
      writeLog(`[SERIAL] Auto-seleccionando puerto serial: ${portList[0].portName || portList[0].portId}`);
      callback(portList[0].portId);
    } else {
      callback('');
    }
  });

  mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    if (permission === 'usb' || permission === 'serial') {
      return true;
    }
    return false;
  });

  mainWindow.webContents.session.setDevicePermissionHandler((details) => {
    if (details.deviceType === 'usb' || details.deviceType === 'serial') {
      return true;
    }
    return false;
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

  // Configuración del Auto-Updater (Actualizaciones Automáticas de Electron)
  autoUpdater.logger = {
    info: (msg) => writeLog(`[UPDATER INFO] ${msg}`),
    warn: (msg) => writeLog(`[UPDATER WARN] ${msg}`),
    error: (msg) => writeLog(`[UPDATER ERROR] ${msg}`)
  };

  autoUpdater.on('checking-for-update', () => {
    writeLog('[UPDATER] Buscando actualizaciones...');
  });
  autoUpdater.on('update-available', (info) => {
    writeLog(`[UPDATER] Actualización disponible: Versión ${info.version}. Descargando...`);
  });
  autoUpdater.on('update-not-available', () => {
    writeLog('[UPDATER] La aplicación está en la versión más reciente.');
  });
  autoUpdater.on('error', (err) => {
    writeLog(`[UPDATER ERROR] Error durante la actualización: ${err.message}`);
  });
  autoUpdater.on('download-progress', (progressObj) => {
    writeLog(`[UPDATER] Progreso de descarga: ${Math.round(progressObj.percent)}%`);
  });
  autoUpdater.on('update-downloaded', (info) => {
    writeLog('[UPDATER] Actualización descargada con éxito. Se instalará automáticamente al cerrar la aplicación.');
  });

  // Solo buscar actualizaciones si la aplicación está empaquetada (producción)
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify();
  } else {
    writeLog('[UPDATER] Modo desarrollo detectado. Se omite la búsqueda de actualizaciones.');
  }
}

// Función recursiva para verificar si el Frontend ya está listo
let intentos = 0;
function verificarServicio() {
  intentos++;
  writeLog(`Verificando servicio frontend en http://localhost... (Intento #${intentos})`);
  
  http.get('http://localhost', (res) => {
    // Si responde (cualquier código de estado), cargamos la URL real de la app
    writeLog(`¡Frontend detectado! Estado HTTP: ${res.statusCode}. Redirigiendo a http://localhost...`);
    
    // Limpiar el caché de la sesión de Electron antes de cargar la URL
    mainWindow.webContents.session.clearCache()
      .then(() => {
        writeLog("Caché de Electron limpiado correctamente.");
        return mainWindow.loadURL('http://localhost', {
          extraHeaders: 'pragma: no-cache\nCache-Control: no-cache'
        });
      })
      .catch((err) => {
        writeLog(`Error al limpiar el caché: ${err.message}. Cargando de todas formas...`);
        mainWindow.loadURL('http://localhost');
      });
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

