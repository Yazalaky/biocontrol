# BioControl - Gestión Biomédica

Aplicación web para gestión biomédica con control por roles, inventario de equipos, actas, firmas, mantenimientos, calibraciones, visitas y rutero.

## Documentación clave
- Continuidad técnica y traspaso: `docs/HANDOFF.md`

## Stack
- Frontend: React + Vite + TypeScript
- Backend: Firebase (Auth, Firestore, Storage, Functions, Hosting)
- Gráficas: Recharts
- Región de Functions: `us-central1`

## Requisitos
- Node.js 20 (recomendado para alinear con Functions)
- npm
- Firebase CLI (`npx firebase-tools`)

## Configuración local
1. Clonar repositorio:
   - `git clone <URL_DEL_REPO>`
   - `cd biocontrol`
2. Instalar dependencias frontend:
   - `npm install`
3. Instalar dependencias de Cloud Functions:
   - `cd functions && npm install && cd ..`
4. Configurar variables de entorno:
   - `cp .env.example .env.local`
   - Editar `.env.local` con valores reales `VITE_FIREBASE_*`
5. Autenticar Firebase CLI:
   - `npx firebase-tools login`
   - `npx firebase-tools use biocontrol-43676`
6. Ejecutar en desarrollo:
   - `npm run dev`

## Scripts
Frontend (`package.json`):
- `npm run dev`
- `npm run build`
- `npm run preview`

Functions (`functions/package.json`):
- `npm --prefix functions run lint`
- `npm --prefix functions run build`
- `npm --prefix functions run deploy`

## Deploy
Opción recomendada por etapas:
1. `npm run build`
2. `npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage`
3. `npx firebase-tools deploy --only functions`
4. `npx firebase-tools deploy --only hosting`

Deploy completo:
- `npx firebase-tools deploy`

## Módulos principales
- Dashboard
- Pacientes
- Profesionales
- Inventario de equipos
- Mantenimientos
- Calibraciones
- Reportes de visitas
- Rutero (visitador)
- Actas internas
- Informes
- Admin (habilitado por `admins/{uid}`)

## Roles
- GERENCIA
- INGENIERO_BIOMEDICO
- AUXILIAR_ADMINISTRATIVA
- VISITADOR

La lógica de acceso está en:
- `firestore.rules`
- `storage.rules`
- `components/Layout.tsx`
- `contexts/AuthContext.tsx`

## Estructura relevante
- `App.tsx`: router por hash
- `pages/`: pantallas por módulo
- `components/`: layout, formatos de actas y UI compartida
- `services/firestoreData.ts`: suscripciones y CRUD
- `services/firebaseFunctions.ts`: cliente de Functions
- `functions/src/index.ts`: lógica backend server-side
- `firestore.rules`, `storage.rules`, `firestore.indexes.json`, `firebase.json`

## Troubleshooting rápido
- `Missing or insufficient permissions`:
  - Verificar `users/{uid}.rol` en Firestore.
  - Publicar reglas actualizadas.
  - Cerrar sesión e iniciar nuevamente.
- Error por índice faltante:
  - Crear desde el link del error o desplegar `firestore.indexes.json`.
- Errores Storage 401/412/403:
  - Revisar `storage.rules`, bucket y estado de App Check.

## Seguridad y git
- No subir `.env.local`.
- Mantener reglas e índices versionados.
- Antes de merge/deploy: validar con `npm run build`.
