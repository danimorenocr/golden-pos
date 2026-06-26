# Golden POS - Aplicación de Escritorio

Este proyecto empaqueta el frontend y orquesta los microservicios en contenedores Docker a través de una aplicación de escritorio multiplataforma utilizando **Electron** y **electron-builder**.

---

## 🛠️ Requisitos Previos

Asegúrate de tener instalados los siguientes componentes en tu máquina:

1. [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Debe estar abierto y ejecutándose).
2. [Node.js](https://nodejs.org/) (Versión 18 o superior).

---

## 🚀 Desarrollo Local

Para iniciar la aplicación en modo desarrollo:

1. Ve a la carpeta de la aplicación Electron:
   ```bash
   cd electron-app
   ```
2. Instala las dependencias necesarias:
   ```bash
   npm install
   ```
3. Ejecuta la aplicación:
   ```bash
   npm start
   ```

> 💡 **¿Qué hace el flujo de inicio?**
> 1. Levanta los contenedores necesarios usando `docker compose up -d` de manera silenciosa en segundo plano.
> 2. Muestra inmediatamente la pantalla de carga (`loading.html`).
> 3. Realiza peticiones de verificación al API Gateway (`http://localhost:3000`).
> 4. Cuando el Gateway responde, redirige la pantalla principal al Frontend (`http://localhost`).
> 5. Al cerrar la ventana, detiene todos los contenedores con `docker compose down`.

---

## 📦 Compilación del Instalador (.exe)

Para compilar el ejecutable e instalador para Windows:

1. Sitúate en la carpeta `electron-app/` y ejecuta:
   ```bash
   npm run dist
   ```
2. Esto generará el instalador interactivo `.exe` en la ruta:
   ```text
   electron-app/dist/golden-pos-app Setup 1.0.0.exe
   ```

---

## 🐙 Publicar como Release en GitHub

Puedes publicar el instalador generado de tres formas distintas:

### Opción 1: A través de la interfaz web de GitHub (Recomendado)
1. Entra a tu repositorio en GitHub.
2. En la barra lateral derecha, haz clic en **Releases** > **Draft a new release**.
3. Define un tag de versión (ej. `v1.0.0`) y un título.
4. Arrastra y suelta el archivo ejecutable generado:
   `electron-app/dist/golden-pos-app Setup 1.0.0.exe` al área de adjuntos.
5. Haz clic en **Publish release**.

### Opción 2: Usando GitHub CLI (`gh`)
Si tienes instalada la herramienta de línea de comandos de GitHub, puedes crear la release directamente desde tu terminal en la raíz del proyecto:

```bash
# Iniciar sesión si es necesario
gh auth login

# Crear el release y adjuntar el instalador
gh release create v1.0.0 ./electron-app/dist/golden-pos-app\ Setup\ 1.0.0.exe --title "Versión 1.0.0" --notes "Lanzamiento oficial de Golden POS."
```

Para actualizar una release existente y reemplazar el instalador:
```bash
gh release upload v1.0.0 ./electron-app/dist/golden-pos-app\ Setup\ 1.0.0.exe --clobber
```

### Opción 3: Automatizado con electron-builder
Puedes configurar `electron-builder` para que publique de manera automática al ejecutar la compilación.

1. Asegúrate de definir tu repositorio en el `package.json` de la carpeta `electron-app`:
   ```json
   "repository": {
     "type": "git",
     "url": "git+https://github.com/tu-usuario/nombre-repositorio.git"
   }
   ```
2. Cambia el campo `"publish": null` por el proveedor correspondiente:
   ```json
   "build": {
     "publish": {
       "provider": "github",
       "owner": "tu-usuario",
       "repo": "nombre-repositorio"
     }
   }
   ```
3. Ejecuta la compilación enviando tu token de acceso de GitHub (`GH_TOKEN`):
   - **En Windows (PowerShell)**:
     ```powershell
     $env:GH_TOKEN="tu_personal_access_token"
     npm run dist -- --publish always
     ```
   - **En Windows (CMD)**:
     ```cmd
     set GH_TOKEN=tu_personal_access_token
     npm run dist -- --publish always
     ```
