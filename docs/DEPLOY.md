# Despliegue

## Objetivo

Describir el flujo recomendado para desplegar BioControl con validaciones mínimas previas y posteriores.

## Verificaciones previas

- Confirmar que no se exponen secretos en el repositorio.
- Validar cambios en documentación, frontend, reglas y Functions según el alcance real.
- Verificar que `firestore.rules`, `storage.rules` y `firestore.indexes.json` estén alineados con el código.
- Confirmar variables de entorno correctas en el entorno de trabajo local.
- Revisar que el proyecto activo de Firebase sea `biocontrol-43676`.

## Configuración Firebase relevante para despliegue

Elementos confirmados en el repositorio:

- Proyecto por defecto en `.firebaserc`:
  `biocontrol-43676`
- `firebase.json` configura:
  - `functions` con `source: functions`
  - `firestore.rules`
  - `firestore.indexes.json`
  - `storage.rules`
  - `hosting.public: dist`
  - rewrite SPA a `index.html`
- `functions/package.json` define runtime Node.js 20
- `services/firebaseFunctions.ts` usa región `us-central1`

Servicios Firebase implicados en despliegue:

- Firebase Hosting
- Cloud Functions for Firebase
- Cloud Firestore
- Firebase Storage

Pendiente por confirmar:

- Existencia de ambientes adicionales aparte del proyecto por defecto
- Procedimiento formal de promoción entre ambientes

## Comandos de validación previos

```bash
npm run build
```

Si hubo cambios en reglas:

```bash
npm run test:rules
```

Si hubo cambios en Functions:

```bash
npm --prefix functions run lint
npm --prefix functions run build
```

Si se requiere validar proyecto activo antes de desplegar:

```bash
npx firebase-tools use biocontrol-43676
```

## Pasos de despliegue recomendados

### 1. Reglas e índices

```bash
npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage
```

Incluye:

- Reglas de Firestore
- Índices de Firestore
- Reglas de Firebase Storage

### 2. Cloud Functions

```bash
npx firebase-tools deploy --only functions
```

Consideraciones:

- `firebase.json` ejecuta predeploy de lint y build para Functions.
- Las Functions están preparadas para `us-central1`.

### 3. Hosting

```bash
npx firebase-tools deploy --only hosting
```

Precondición:

- El frontend debe haberse compilado previamente en `dist` con `npm run build`.

### Despliegue completo

```bash
npx firebase-tools deploy
```

## Verificaciones posteriores

- Iniciar sesión con un usuario válido y confirmar carga de perfil.
- Validar acceso al menos en el flujo principal del rol afectado.
- Revisar que no aparezcan errores de permisos en consola.
- Confirmar que consultas nuevas no fallen por índices faltantes.
- Si hubo cambios de Storage, validar carga/lectura del archivo correspondiente.
- Revisar logs de Functions si el cambio involucró procesos transaccionales.
- Confirmar que Hosting sirva la SPA correctamente y que el rewrite a `index.html` siga funcionando.
- Si el cambio involucró autenticación, validar acceso con un usuario real que tenga `users/{uid}` correctamente provisionado.

## Rollback básico

No se encontró un script automatizado de rollback en el repositorio. Procedimiento base sugerido:

1. Identificar el último commit estable.
2. Llevar un workspace limpio a ese commit.
3. Volver a desplegar los componentes afectados:
   `firestore.rules`, `firestore.indexes.json`, `storage.rules`, `functions` y/o `hosting`.
4. Validar nuevamente login y flujo crítico del rol impactado.

Pendiente por confirmar:

- Procedimiento formal de rollback de hosting y functions aprobado por el equipo.
- Existencia de ambientes separados además del proyecto Firebase por defecto.

## Riesgos operativos

- Si solo existe un ambiente Firebase, cualquier despliegue impacta directamente el entorno operativo.
- Si se despliega frontend sin reglas, índices o Functions relacionadas, pueden romperse flujos ya soportados por la interfaz.
- Si faltan validaciones manuales posteriores al despliegue, errores de permisos o de trazabilidad pueden detectarse tarde en operación.
- Si no se confirma el proyecto activo de Firebase antes del deploy, existe riesgo de publicar en un entorno incorrecto.
- Si el usuario autenticado no tiene documento válido en `users/{uid}`, el login técnico funciona pero el acceso funcional queda bloqueado.
