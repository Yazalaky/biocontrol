# BioControl - Handoff Técnico

## 1) Objetivo del proyecto
BioControl es una app web para gestión biomédica con control por roles. Cubre:
- Pacientes y profesionales.
- Inventario biomédico.
- Entregas/devoluciones con actas y firmas.
- Actas internas (biomédico -> auxiliar).
- Reportes de visita y mantenimientos.
- Rutero del visitador.
- Calibraciones y certificados PDF.
- Dashboard con indicadores operativos/costos.

## 2) Stack y estructura
- Frontend: React + Vite + TypeScript.
- Backend: Firebase (Auth, Firestore, Storage, Functions, Hosting).
- Gráficas: `recharts`.
- Región de Functions: `us-central1`.

Archivos clave:
- `App.tsx` (router por hash y páginas).
- `contexts/AuthContext.tsx` (sesión + carga de rol en `users/{uid}`).
- `components/Layout.tsx` (menú lateral por rol + badges).
- `services/firestoreData.ts` (suscripciones y CRUD principal).
- `services/firebaseFunctions.ts` (cliente de Cloud Functions).
- `firestore.rules`, `storage.rules`, `firestore.indexes.json`, `firebase.json`.
- `functions/src/index.ts` (lógica server-side).

## 3) Proyecto Firebase actual
- Proyecto por defecto: `biocontrol-43676` (`.firebaserc`).
- Hosting SPA: `dist` con rewrite a `index.html`.
- Storage activo en Firebase Console (carpetas: `equipos/`, `reportes_equipos/`, `solicitudes_equipos_paciente/`).

## 4) Roles y acceso (resumen)
Roles (`types.ts`):
- `GERENCIA`
- `INGENIERO_BIOMEDICO`
- `AUXILIAR_ADMINISTRATIVA`
- `VISITADOR`

Control de perfil:
- Auth valida login, luego lee `users/{uid}`.
- Si no existe `users/{uid}` o `rol` inválido, bloquea acceso.
- `admins/{uid}` habilita pantalla Admin (flag `enabled: true`).

## 5) Rutas/páginas principales
Definidas en `App.tsx`:
- `#/` Dashboard
- `#/pacientes`
- `#/profesionales`
- `#/equipos`
- `#/mantenimientos`
- `#/calibraciones`
- `#/visitas` (para biomédico se etiqueta como “Reportes de Visitas” en el menú)
- `#/rutero` (visitador)
- `#/actas-internas`
- `#/informes`
- `#/admin` (solo con flag admin)

## 6) Firestore (modelo operativo)
Colecciones clave:
- `users` (nombre + rol)
- `admins` (flag admin UI)
- `pacientes`
- `profesionales`
- `equipos`
- `equipos/{id}/calibraciones` (subcolección)
- `asignaciones` (pacientes)
- `asignaciones_profesionales`
- `actas_profesionales` (entrega múltiple)
- `actas_internas`
- `reportes_equipos` (visitador -> biomédico)
- `solicitudes_equipos_paciente` (visitador propone equipo para inventario)
- `mantenimientos`
- `tipos_equipo` (plantillas de hoja de vida)

Reglas relevantes (`firestore.rules`):
- Visitador: lectura acotada (pacientes activos, asignaciones activas, etc.).
- Biomédico: escritura de inventario/tipos/calibraciones.
- Auxiliar: escritura de pacientes/asignaciones/flujos administrativos.
- Gerencia: lectura.
- Deny por defecto.

## 7) Storage (modelo operativo)
Rutas activas (`storage.rules`):
- `reportes_equipos/{uid}/{reporteId}/{fileName}` (fotos visitador, máx 5MB, jpg/png)
- `solicitudes_equipos_paciente/{uid}/{solicitudId}/{fileName}` (fotos visitador, 3..5 en flujo app)
- `equipos/{equipoId}/{fileName}` (foto equipo, biomédico)
- `calibraciones/{equipoId}/{fileName}` (certificados PDF, biomédico)

Lectura de certificados/calibraciones:
- Biomédico, auxiliar, gerencia y admin.
- Visitador: sin acceso a certificados.

## 8) Cloud Functions desplegadas (referencia)
Exports en `functions/src/index.ts`:
- `syncUserProfile`
- `adminCreateUser`
- `adminSetUserRole`
- `listAuxiliares`
- `listPacientesSinAsignacion`
- `rebuildVisitadorFlags`
- `guardarFirmaEntregaVisitador`
- `defaultEquipoDisponibilidad`
- `onAsignacionCreatedUpdateFlags`
- `onAsignacionUpdatedUpdateFlags`
- `createInternalActa`
- `acceptInternalActa`
- `cancelInternalActa`
- `approveSolicitudEquipoPaciente`
- `onReporteEquipoCreatedNotify`
- `onSolicitudEquipoPacienteCreatedNotify`

## 9) Setup en nuevo portátil (paso a paso)
1. Clonar repo:
   - `git clone <URL_DEL_REPO>`
   - `cd biocontrol`
2. Instalar dependencias frontend:
   - `npm install`
3. Instalar dependencias functions:
   - `cd functions && npm install && cd ..`
4. Crear `.env.local` desde `.env.example`:
   - Completar `VITE_FIREBASE_*` reales.
5. Login Firebase CLI:
   - `npx firebase-tools login`
   - `npx firebase-tools use biocontrol-43676`
6. Ejecutar local:
   - `npm run dev`
7. (Opcional) Build:
   - `npm run build`

## 10) Deploy recomendado
Orden sugerido:
1. `npm run build`
2. `npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage`
3. `npx firebase-tools deploy --only functions`
4. `npx firebase-tools deploy --only hosting`

Si quieres todo junto:
- `npx firebase-tools deploy`

## 11) Troubleshooting conocido
1. `Missing or insufficient permissions`:
   - Verificar `users/{uid}.rol`.
   - Confirmar que reglas publicadas coinciden con repo.
   - Cerrar sesión y volver a entrar tras cambio de rol/rules.
2. Error de índices:
   - Crear índice desde link del error de consola o desplegar `firestore.indexes.json`.
3. Functions deploy falla con service identity de `pubsub/eventarc`:
   - En Cloud Shell:
   - `gcloud services enable pubsub.googleapis.com --project biocontrol-43676`
   - `gcloud services enable eventarc.googleapis.com --project biocontrol-43676`
   - `gcloud beta services identity create --service=pubsub.googleapis.com --project biocontrol-43676`
   - `gcloud beta services identity create --service=eventarc.googleapis.com --project biocontrol-43676`
4. Errores Storage 401/412/403:
   - Validar `storage.rules` desplegadas.
   - Revisar App Check (si se activa enforcement, el cliente debe estar preparado).
   - Verificar bucket correcto en `VITE_FIREBASE_STORAGE_BUCKET`.

## 12) Convenciones operativas ya aplicadas
- Login por email/password, sin auto-registro público.
- Flujo estricto por rol.
- Texto de negocio mayoritariamente en mayúsculas en formularios/guardado.
- Sede del acta de paciente configurada a `BUCARAMANGA` en formato.
- Actas, reportes y mantenimientos con firmas y trazabilidad según flujo.

## 13) Pendientes sugeridos (backlog)
- Unificar y ampliar README (actualmente es base de AI Studio).
- Documentar colección por colección (campos obligatorios/opcionales).
- Agregar tests mínimos de reglas (Firestore/Storage emulator).
- Revisar code-splitting (bundle principal alto en build).

## 14) Prompt recomendado para retomar con Codex
Usar este prompt al abrir el proyecto en el nuevo equipo:

```txt
Lee primero docs/HANDOFF.md, App.tsx, firestore.rules, storage.rules, services/firestoreData.ts y functions/src/index.ts.
Quiero que entiendas el estado actual de BioControl y continúes desde ahí sin romper funcionalidades.
Entrégame:
1) resumen corto de arquitectura,
2) riesgos actuales,
3) plan de trabajo en pasos pequeños,
4) lista exacta de archivos que vas a modificar antes de tocar código.
```

## 15) Checklist antes de subir a GitHub
- No subir secretos (`.env.local` fuera de git).
- Confirmar que `firestore.rules`, `storage.rules`, `firestore.indexes.json` estén actualizados.
- Confirmar build local (`npm run build`).
- Commit de `docs/HANDOFF.md`.

