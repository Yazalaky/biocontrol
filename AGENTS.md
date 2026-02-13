# AGENTS.md - BioControl

## Propósito
Este archivo define el contexto operativo para asistentes (Codex/IA) que trabajen en este repositorio.
El objetivo es hacer cambios seguros, pequeños y compatibles con los flujos ya validados en producción.

## Contexto mínimo antes de editar
Leer en este orden:
1. `docs/HANDOFF.md`
2. `README.md`
3. `firestore.rules`
4. `storage.rules`
5. `App.tsx`
6. `services/firestoreData.ts`
7. `functions/src/index.ts`

## Stack y arquitectura
- Frontend: React + Vite + TypeScript.
- Backend: Firebase Auth, Firestore, Storage, Functions, Hosting.
- Proyecto Firebase por defecto: `biocontrol-43676`.
- Región de Functions: `us-central1`.

## Roles del negocio
- `GERENCIA`: lectura.
- `AUXILIAR_ADMINISTRATIVA`: gestión operativa de pacientes/asignaciones/actas.
- `INGENIERO_BIOMEDICO`: inventario, mantenimientos, calibraciones, aprobación técnica.
- `VISITADOR`: visitas, reportes y captura de firma de entrega en domicilio.

## Flujos críticos que no se deben romper
1. Login:
   - Solo usuarios existentes en Firebase Auth con perfil en `users/{uid}` y `rol` válido.
2. Actas de entrega paciente:
   - Mantener consistencia de firmas y campos.
   - En acta de paciente, la sede debe mostrarse como `BUCARAMANGA`.
3. Acta interna:
   - Flujo biomédico -> auxiliar con aceptación y firma.
4. Visitador:
   - Solo captura firma de entrega en asignaciones activas.
   - No modifica información clínica.
5. Reportes de visita:
   - Estados: `ABIERTO`, `EN_PROCESO`, `CERRADO`.
   - Historial y trazabilidad obligatorios.
6. Calibraciones:
   - Aplican a equipos MEDICUC con periodicidad definida.
   - Permitir historial, costo y certificado PDF.

## Reglas de implementación
- Hacer cambios mínimos y focalizados.
- Conservar compatibilidad con datos existentes en Firestore.
- No hacer migraciones destructivas automáticas sin solicitud explícita.
- Si se agregan campos nuevos:
  - Mantener defaults seguros.
  - Considerar registros legacy sin ese campo.
- Si se tocan permisos:
  - Actualizar `firestore.rules` y/o `storage.rules`.
  - Validar por rol impactado.
- Si se crean consultas nuevas:
  - Verificar índices en `firestore.indexes.json`.

## Convenciones de UI/UX del proyecto
- Diseño estilo MD3 ya adoptado.
- Debe funcionar en desktop, tablet y móvil.
- Mensajería en español.
- Formularios y datos operativos se manejan en mayúsculas cuando aplica al negocio.

## Convenciones de código
- TypeScript estricto y cambios legibles.
- Evitar refactors amplios no solicitados.
- Mantener nombres de colecciones/campos ya estandarizados.
- No introducir nuevas dependencias sin necesidad clara.

## Checklist antes de cerrar un cambio
1. Verificar compilación:
   - `npm run build`
2. Si hubo cambios en functions:
   - `npm --prefix functions run lint`
   - `npm --prefix functions run build`
3. Si hubo cambios en reglas o índices:
   - Confirmar despliegue de `firestore.rules`, `storage.rules`, `firestore.indexes.json`.
4. Probar al menos el flujo principal del rol afectado.
5. Documentar en `docs/HANDOFF.md` si el cambio modifica comportamiento de negocio.

## No hacer
- No borrar datos productivos desde scripts sin aprobación explícita.
- No usar comandos destructivos de git (`reset --hard`, `checkout --`) sin instrucción explícita.
- No exponer secretos en repositorio (`.env.local` nunca se versiona).

