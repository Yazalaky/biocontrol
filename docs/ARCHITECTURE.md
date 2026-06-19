# Arquitectura

## Arquitectura general

BioControl sigue una arquitectura web cliente-servidor basada en Firebase:

- Cliente SPA en React + Vite + TypeScript
- Backend serverless en Cloud Functions
- Persistencia principal en Firestore
- Almacenamiento de archivos en Firebase Storage
- Autenticación con Firebase Auth
- Publicación del frontend en Firebase Hosting

## Servicios de Firebase usados

Servicios confirmados en el repositorio:

- Firebase Auth
- Cloud Firestore
- Firebase Storage
- Cloud Functions for Firebase
- Firebase Hosting

Pendiente por confirmar:

- Firebase Analytics, habilitable desde frontend solo si existe `VITE_FIREBASE_MEASUREMENT_ID`
- Uso de otros servicios administrados de Firebase fuera de los archivos revisados
- Realtime Database: no se encontró evidencia de uso en el código revisado

## Frontend

### Tecnologías

- React 19
- Vite 6
- TypeScript
- Recharts

### Organización observada

- `App.tsx`: enrutamiento por hash y selección de página
- `pages/`: módulos funcionales por vista
- `components/`: layout, formatos de impresión, UI compartida
- `contexts/`: autenticación y tema
- `services/`: acceso a Firestore, Functions, Firebase y utilitarios
- `types.ts`: modelos y enums centrales

### Flujo de ejecución

1. Se inicializa Firebase desde `services/firebase.ts`.
2. `AuthContext` escucha estado de sesión.
3. Se carga `users/{uid}` para resolver rol, alcance y contexto activo.
4. `App.tsx` dirige al módulo permitido según rol y hash actual.
5. Las páginas consumen suscripciones y operaciones desde `services/firestoreData.ts`.

### Variables de entorno esperadas

Confirmadas en `services/firebase.ts`:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID` opcional

Pendiente por confirmar:

- `GEMINI_API_KEY` aparece referenciada en `vite.config.ts`, pero no se identificó un uso funcional directo en la aplicación principal.

## Backend

### Cloud Functions

Archivo principal:

- `functions/src/index.ts`

Responsabilidades observadas:

- Sincronización de perfil de usuario
- Administración de roles y usuarios
- Creación transaccional de pacientes, equipos y asignaciones
- Flujo de actas internas
- Gestión de firma por visitador
- Reportes de visita
- Aprobación de solicitudes de equipos para paciente
- Actualización de flags derivados

### Región y runtime

- Región: `us-central1`
- Runtime de Functions: Node.js 20

### Functions expuestas observadas

Callables y triggers confirmados en `functions/src/index.ts`:

- `syncUserProfile`
- `adminCreateUser`
- `adminSetUserRole`
- `listAuxiliares`
- `seedOrgCatalogPhase1`
- `backfillOrgContextPhase1`
- `createPaciente`
- `createEquipo`
- `setEquipoConsultorio`
- `deleteEquipoDoc`
- `createAsignacionPaciente`
- `listPacientesSinAsignacion`
- `listFirmasCapturadasVisitador`
- `rebuildVisitadorFlags`
- `finalizarDevolucionAsignacion`
- `egresarPaciente`
- `iniciarReporteEnProceso`
- `agregarNotaReporte`
- `cerrarReporteEquipo`
- `createMantenimiento`
- `updateMantenimiento`
- `addMantenimientoHistorial`
- `addCalibracionEquipo`
- `updateCalibracionCertificado`
- `updateCalibracionFields`
- `guardarFirmaEntregaVisitador`
- `defaultEquipoDisponibilidad`
- `onAsignacionCreatedUpdateFlags`
- `onAsignacionUpdatedUpdateFlags`
- `createInternalActa`
- `acceptInternalActa`
- `cancelInternalActa`
- `approveSolicitudEquipoPaciente`
- `createReporteEquipo`
- `onReporteEquipoCreatedNotify`
- `onSolicitudEquipoPacienteCreatedNotify`

## Base de datos

### Firestore

Colecciones principales observadas:

- `users`
- `admins`
- `empresas`
- `sedes`
- `consultorios`
- `pacientes`
- `profesionales`
- `equipos`
- `asignaciones`
- `asignaciones_profesionales`
- `actas_profesionales`
- `actas_internas`
- `reportes_equipos`
- `solicitudes_equipos_paciente`
- `mantenimientos`
- `tipos_equipo`
- `counters`

Subcolección relevante:

- `equipos/{id}/calibraciones`

### Reglas

- Firestore:
  `firestore.rules`
- Índices:
  `firestore.indexes.json`

### Realtime Database

No se encontró evidencia de uso de Firebase Realtime Database en el código y configuración revisados.

## Autenticación

- Proveedor observado:
  Firebase Auth con email y contraseña
- Criterio de acceso:
  el usuario autenticado debe tener documento en `users/{uid}` y `rol` válido
- Roles:
  `GERENCIA`, `AUXILIAR_ADMINISTRATIVA`, `INGENIERO_BIOMEDICO`, `VISITADOR`
- Soporte adicional:
  flag opcional de admin mediante `admins/{uid}`
- Validación complementaria:
  `AuthContext` carga `users/{uid}` y varias operaciones sensibles vuelven a validarse en reglas y Cloud Functions

## Hosting

- Hosting SPA en Firebase Hosting
- Carpeta pública: `dist`
- Rewrite global a `index.html`

## Storage

Rutas funcionales observadas:

- `reportes_equipos/{uid}/{reporteId}/{fileName}`
- `solicitudes_equipos_paciente/{uid}/{solicitudId}/{fileName}`
- `equipos/{equipoId}/{fileName}`
- `calibraciones/{equipoId}/{fileName}`

## Integraciones

Integraciones confirmadas:

- Firebase Auth
- Firestore
- Firebase Storage
- Cloud Functions
- Firebase Hosting

Integraciones no confirmadas:

- Analytics en producción, condicionado por `VITE_FIREBASE_MEASUREMENT_ID`
- Uso funcional de `GEMINI_API_KEY`

## Estructura general de configuración Firebase

Archivos relevantes observados:

- `.firebaserc`: proyecto por defecto `biocontrol-43676`
- `firebase.json`: definición de Hosting, Functions, Firestore y Storage
- `firestore.rules`: reglas de seguridad de Firestore
- `firestore.indexes.json`: índices compuestos
- `storage.rules`: reglas de Firebase Storage
- `services/firebase.ts`: inicialización del SDK web
- `services/firebaseFunctions.ts`: cliente de Functions en región `us-central1`
- `functions/package.json`: scripts, runtime Node.js 20 y despliegue de Functions

## Riesgos operativos detectados

- Solo se encontró un proyecto Firebase configurado por defecto en `.firebaserc`; si no existen ambientes separados, hay mayor riesgo de desplegar cambios directamente sobre el entorno operativo.
- Si reglas, índices y Functions no se despliegan en conjunto cuando corresponde, pueden aparecer errores de permisos, consultas fallidas o divergencias entre frontend y backend.
- La seguridad de acceso depende de que `users/{uid}` esté correctamente provisionado; un alta incompleta bloquea login funcional aunque el usuario exista en Auth.
- La falta de documentación formal de rollback aumenta el riesgo operativo ante incidentes de despliegue.
- La cobertura automatizada detectada para reglas es parcial; siguen existiendo flujos críticos sin validación automatizada visible en el repositorio.

## Matriz Cliente vs Backend

### Operaciones ya protegidas por Cloud Functions

- `createPaciente`
  - Alta de paciente con consecutivo y validaciones transaccionales.
- `createEquipo`
  - Alta de equipo con reglas de inventario, contexto y consecutivos.
- `setEquipoConsultorio`
  - Asignación/quitar consultorio con validaciones de sede y estado.
- `deleteEquipoDoc`
  - Eliminación de equipo con validaciones de historial y dependencias.
- `createAsignacionPaciente`
  - Asignación transaccional paciente-equipo.
- `createReporteEquipo`
  - Creación de reporte con anti-duplicado y contexto.
- `guardarFirmaEntregaVisitador`
  - Firma del visitador validada server-side.
- `approveSolicitudEquipoPaciente`
  - Aprobación de solicitud y flujo posterior en backend.
- `createInternalActa`
- `acceptInternalActa`
- `cancelInternalActa`
- `adminCreateUser`
- `adminSetUserRole`
- `listAuxiliares`
- `listPacientesSinAsignacion`
- `listFirmasCapturadasVisitador`
- `rebuildVisitadorFlags`

### Operaciones que siguen con escritura directa desde cliente

- `savePaciente` cuando edita un paciente existente.
- `saveEquipo` cuando edita un equipo existente.
- `updateEquipoFoto` / `clearEquipoFoto`.
- `createSolicitudEquipoPaciente`.
- `marcarReporteVistoPorVisitador`.
- `guardarFirmaPaciente`.
- `guardarFirmaAuxiliar`.
- `guardarFirmaProfesionalActa`.
- `guardarFirmaAuxiliarActa`.
- `guardarFirmaProfesional`.
- `guardarFirmaAuxiliarProfesional`.
- `saveProfesional`.
- `createActaProfesional`.
- `asignarEquipoProfesional`.
- `vincularAsignacionProfesionalActa`.
- `devolverEquipoProfesional`.

### Clasificación para P6.2

Prioridad media:
- `savePaciente` edición
- `saveEquipo` edición
- `saveProfesional`
- `createSolicitudEquipoPaciente`
- `marcarReporteVistoPorVisitador`
- firmas auxiliares/paciente/profesional que hoy escriben directo en documentos
- `createActaProfesional`
- `asignarEquipoProfesional`
- `vincularAsignacionProfesionalActa`
- `devolverEquipoProfesional`

Prioridad baja:
- operaciones administrativas o de apoyo cuya integridad ya está bastante acotada por rules y contexto.

### Conclusión técnica

- Las altas críticas y el bloque principal de integridad operativa ya están en backend.
- Quedan mutaciones directas sobre edición, firmas auxiliares/paciente/profesional y algunos flujos profesionales/solicitudes.
- El siguiente paso recomendado es priorizar edición de entidades operativas y firmas directas en documentos.
