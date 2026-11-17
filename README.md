# BioControl

Aplicación web para gestión biomédica y operativa con control por roles. Centraliza inventario de equipos, pacientes, profesionales, asignaciones, actas, visitas, mantenimientos y calibraciones sobre Firebase.

## Objetivo

Digitalizar y controlar los procesos biomédicos y administrativos del proyecto, asegurando trazabilidad, consistencia de datos, seguridad por rol y compatibilidad con la operación actual en producción.

## Stack

- Frontend: React 19 + Vite 6 + TypeScript
- Backend: Firebase Auth, Firestore, Storage, Cloud Functions, Hosting
- Visualización: Recharts
- Runtime Functions: Node.js 20
- Región de Functions: `us-central1`
- Proyecto Firebase por defecto: `biocontrol-43676`

## Módulos principales

- Dashboard
- Pacientes
- Profesionales
- Inventario de equipos
- Mantenimientos
- Calibraciones
- Reportes de visitas
- Rutero del visitador
- Actas internas
- Informes
- Admin
- Consultorios

## Estructura general

```txt
.
├── App.tsx
├── components/
├── contexts/
├── docs/
├── functions/
│   └── src/index.ts
├── pages/
├── public/
├── services/
├── tests/
├── firestore.rules
├── firestore.indexes.json
├── storage.rules
└── firebase.json
```

## Requisitos previos

- Node.js 20
- npm
- Firebase CLI
- Java en `PATH` para ejecutar pruebas de reglas con Emulator Suite

## Instalación

1. Clonar el repositorio.
2. Instalar dependencias del frontend:

```bash
npm install
```

3. Instalar dependencias de Cloud Functions:

```bash
npm --prefix functions install
```

4. Para desarrollo local no se requieren variables Firebase ni login en la CLI:
   el frontend usa configuración `demo-*` y emuladores.
5. Para un build remoto, crea `.env.production.local` a partir de
   `.env.example` y configura los valores del proyecto destino. No uses esa
   configuración en desarrollo local.

## Ejecución local

Abre dos terminales. En la primera, compila Functions e inicia los emuladores
locales de Auth, Firestore, Functions y Storage:

```bash
npm run emulators:local
```

En la segunda, inicia el frontend conectado a esos emuladores:

```bash
npm run dev
```

La interfaz de Emulator Suite queda en `http://127.0.0.1:4000`; Vite muestra la
URL de BioControl, normalmente `http://localhost:5173`. Crea usuarios
sintéticos en el emulador de Authentication. La aplicación muestra una franja
“ENTORNO LOCAL” y no usa la configuración Firebase de `.env.local`.

La app dirige las llamadas de Functions a `127.0.0.1:5001`, sin fallback a
producción. El comando local compila Functions antes de iniciar el emulador.

Los comandos de emuladores no despliegan recursos. `.firebaserc` conserva
`biocontrol-43676` como proyecto predeterminado de la CLI; por eso, cualquier
comando `firebase deploy` sin un proyecto explícito seguiría apuntando a
producción. La protección y el flujo de deploy se tratarán en una fase aparte.

Vista previa compilada con el proyecto local `demo-*`:

```bash
npm run preview:local
```

Mantén `npm run emulators:local` activo durante la vista previa.

Pruebas existentes de reglas Firestore:

```bash
npm run test:rules
```

## Scripts disponibles

Raíz del proyecto:

- `npm run dev`
- `npm run dev:local`
- `npm run emulators:local`
- `npm run build`
- `npm run build:local`
- `npm run preview`
- `npm run preview:local`
- `npm run test:rules`

Carpeta `functions/`:

- `npm --prefix functions run lint`
- `npm --prefix functions run build`
- `npm --prefix functions run serve`
- `npm --prefix functions run deploy`
- `npm --prefix functions run logs`

## Variables de entorno esperadas

Los builds remotos utilizan variables `VITE_` para inicializar Firebase. Los
modos `dev` y `local` usan configuración fija `demo-*` y no usan esas variables
para inicializar Firebase.

Obligatorias:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

Opcionales:

- `VITE_FIREBASE_MEASUREMENT_ID`

Pendiente por confirmar:

- `GEMINI_API_KEY` aparece referenciada en `vite.config.ts`, pero no se identificó un uso funcional directo en los módulos revisados.

## Seguridad y restricciones relevantes

- No existe auto-registro público.
- El acceso depende de Firebase Auth más perfil válido en `users/{uid}`.
- Los roles soportados son `GERENCIA`, `AUXILIAR_ADMINISTRATIVA`, `INGENIERO_BIOMEDICO` y `VISITADOR`.
- Firestore y Storage aplican restricciones por rol y por contexto organizacional (`empresaId` y `sedeId`).
- Los documentos legacy deben seguir siendo compatibles.

## Despliegue

Los comandos actuales usan `biocontrol-43676` como proyecto predeterminado, que
corresponde a producción. Esta fase de aislamiento local no configura staging
ni habilita despliegues.

Flujo recomendado por etapas:

```bash
npm run build
npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage
npx firebase-tools deploy --only functions
npx firebase-tools deploy --only hosting
```

Despliegue completo:

```bash
npx firebase-tools deploy
```

Ver más detalle en [docs/DEPLOY.md](docs/DEPLOY.md).

## Referencias internas

- Contexto operativo: [CONTEXT.md](CONTEXT.md)
- Resumen funcional: [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md)
- Requerimientos: [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)
- Arquitectura: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Despliegue: [docs/DEPLOY.md](docs/DEPLOY.md)
- Operación: [docs/OPERATIONS.md](docs/OPERATIONS.md)
- Continuidad técnica: [docs/HANDOFF.md](docs/HANDOFF.md)
- Casos de prueba: [TEST_CASES.md](TEST_CASES.md)
- Incidencias conocidas: [KNOWN_ISSUES.md](KNOWN_ISSUES.md)
- Historial documental: [CHANGELOG.md](CHANGELOG.md)

## Troubleshooting rápido

- `Missing or insufficient permissions`:
  revisar `users/{uid}.rol`, reglas desplegadas y contexto activo de empresa/sede.
- Error por índice faltante:
  desplegar `firestore.indexes.json` o crear el índice sugerido por Firestore.
- Errores de Storage `401`, `403` o `412`:
  revisar `storage.rules`, bucket configurado y App Check si aplica.
- Usuario autenticado sin acceso:
  verificar que exista documento en `users/{uid}` y que tenga rol válido.
