# BioControl - Guia de Migracion a Windows 11 LTSC + WSL2

## 1. Descripcion
BioControl es una aplicacion web de gestion biomedica con control por roles.

Incluye:
- Pacientes y profesionales
- Inventario de equipos
- Asignaciones y actas con firmas
- Reportes de visita
- Mantenimientos y calibraciones

Stack:
- Frontend: React + Vite + TypeScript
- Backend: Firebase Auth, Firestore, Storage, Functions, Hosting
- Proyecto Firebase: `biocontrol-43676`
- Region Functions: `us-central1`

## 2. Requisitos del entorno

### 2.1 Requisitos base
- Windows 11 LTSC
- WSL2 con Ubuntu 24.04 (recomendado)
- Git
- Node.js 20
- npm
- Firebase CLI (`firebase-tools`)

### 2.2 Verificacion de versiones
```bash
node -v
npm -v
firebase --version
git --version
```

## 3. Variables de entorno
Crear `.env.local` a partir de `.env.example`:

```bash
cp .env.example .env.local
```

Completar en `.env.local`:
- `VITE_FIREBASE_API_KEY=`
- `VITE_FIREBASE_AUTH_DOMAIN=`
- `VITE_FIREBASE_PROJECT_ID=biocontrol-43676`
- `VITE_FIREBASE_STORAGE_BUCKET=`
- `VITE_FIREBASE_MESSAGING_SENDER_ID=`
- `VITE_FIREBASE_APP_ID=`

Notas:
- `.env.local` no se sube a git.
- Verifica que el bucket de Storage sea el correcto para evitar errores 401/403/412.

## 4. Instalacion (Windows 11 + WSL2)

### 4.1 Habilitar WSL2 (PowerShell como administrador)
```powershell
wsl --install -d Ubuntu-24.04
```

Reiniciar Windows si lo solicita.

### 4.2 Configurar Ubuntu (WSL)
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl unzip zip ca-certificates
```

### 4.3 Instalar Node 20 con nvm
```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
nvm alias default 20
```

### 4.4 Instalar Firebase CLI
```bash
npm install -g firebase-tools
firebase --version
```

### 4.5 Clonar e instalar el proyecto
Trabaja dentro del filesystem Linux de WSL (no en OneDrive ni en `/mnt/c`):

```bash
mkdir -p ~/projects
cd ~/projects
git clone <URL_DEL_REPO> biocontrol
cd biocontrol

npm install
npm --prefix functions install
```

### 4.6 Login y seleccion de proyecto Firebase
```bash
firebase login
firebase use biocontrol-43676
```

Si no abre navegador:
```bash
firebase login --no-localhost
```

## 5. Ejecucion local
```bash
npm run dev
```

URL esperada:
- `http://localhost:5173`

## 6. Build / Deploy

### 6.1 Validaciones locales
```bash
npm run build
npm --prefix functions run lint
npm --prefix functions run build
```

### 6.2 Deploy recomendado por etapas
```bash
npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage
npx firebase-tools deploy --only functions
npx firebase-tools deploy --only hosting
```

Deploy completo:
```bash
npx firebase-tools deploy
```

## 7. Notas importantes

### 7.1 Flujos criticos que no se deben romper
- Login solo con usuario de Auth + perfil en `users/{uid}` con `rol` valido
- En acta de paciente, la sede debe mostrarse como `BUCARAMANGA`
- Visitador solo captura firma en asignaciones activas
- Reportes de visita con estados: `ABIERTO`, `EN_PROCESO`, `CERRADO`
- Calibraciones con historial, costo y certificado PDF

### 7.2 Rutas y archivos clave
- `docs/HANDOFF.md`
- `README.md`
- `firestore.rules`
- `storage.rules`
- `firestore.indexes.json`
- `App.tsx`
- `services/firestoreData.ts`
- `functions/src/index.ts`

### 7.3 Puertos
- Frontend Vite: `5173` (por defecto)

### 7.4 Recomendaciones de trabajo en Windows
- Usar VS Code con extension `Remote - WSL`
- Abrir el proyecto desde WSL (`code .`)
- Mantener fin de linea en LF:
  ```bash
  git config --global core.autocrlf input
  git config --global core.eol lf
  ```

## 8. Troubleshooting rapido

### 8.1 Error de permisos (`Missing or insufficient permissions`)
- Verificar `users/{uid}.rol`
- Confirmar reglas desplegadas
- Cerrar sesion e iniciar nuevamente

### 8.2 Error por indice faltante
- Crear indice desde el link del error o desplegar `firestore.indexes.json`

### 8.3 Functions no compilan
- Ejecutar:
  ```bash
  npm --prefix functions install
  npm --prefix functions run lint
  npm --prefix functions run build
  ```

### 8.4 Error de Storage (401/412/403)
- Revisar `storage.rules` desplegadas
- Confirmar bucket en `.env.local`
- Revisar App Check si esta habilitado

