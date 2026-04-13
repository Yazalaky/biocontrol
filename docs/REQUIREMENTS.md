# Requerimientos

## Requerimientos funcionales

### Acceso y seguridad

- El sistema debe permitir inicio de sesión mediante Firebase Auth.
- El sistema debe validar que el usuario autenticado tenga documento en `users/{uid}`.
- El sistema debe bloquear acceso si el usuario no tiene `rol` válido.
- El sistema debe restringir acciones según rol y contexto organizacional.

### Gestión operativa

- El sistema debe permitir gestionar pacientes.
- El sistema debe permitir gestionar profesionales.
- El sistema debe permitir gestionar inventario de equipos.
- El sistema debe permitir asignar equipos a pacientes y profesionales.
- El sistema debe permitir crear y consultar actas de entrega.
- El sistema debe permitir flujo de acta interna entre biomédico y auxiliar.
- El sistema debe permitir registrar y gestionar reportes de visita.
- El sistema debe permitir operar un rutero para visitador.
- El sistema debe permitir registrar mantenimientos.
- El sistema debe permitir registrar calibraciones con certificado PDF.
- El sistema debe permitir gestionar consultorios en el contexto habilitado.
- El sistema debe ofrecer vistas de dashboard e informes.

## Requerimientos no funcionales

- Seguridad basada en reglas de Firestore y Storage.
- Compatibilidad con datos legacy de Firestore.
- Mensajería y UI en español.
- Uso de TypeScript estricto.
- Aplicación usable en desktop, tablet y móvil.
- Trazabilidad de acciones críticas.
- Despliegue sobre Firebase Hosting y Cloud Functions.
- Validación de reglas mediante Emulator Suite.

## Reglas de negocio

- Solo usuarios existentes en Auth con perfil válido en `users/{uid}` pueden ingresar.
- `GERENCIA` tiene lectura; no se observó flujo estándar de escritura operativa para este rol.
- `AUXILIAR_ADMINISTRATIVA` gestiona pacientes, asignaciones y flujos administrativos.
- `INGENIERO_BIOMEDICO` gestiona inventario, mantenimientos, calibraciones y aprobación técnica.
- `VISITADOR` solo captura firma sobre asignaciones activas y reporta novedades de visita.
- El acta de paciente debe mostrar sede `BUCARAMANGA`.
- Los reportes de visita deben conservar estados `ABIERTO`, `EN_PROCESO` y `CERRADO`.
- Las calibraciones aplican a equipos biomédicos y deben conservar historial, costo y certificado.
- Equipos `DADO_DE_BAJA` no deben asignarse a consultorio.
- Un equipo ya vinculado a un consultorio no debe moverse directamente a otro sin desvinculación previa.

## Pendientes

- Documentar colección por colección con campos obligatorios y opcionales.
- Definir criterios formales de versionado y release.
- Confirmar si `GEMINI_API_KEY` sigue siendo requerido.
- Documentar ambientes además del proyecto Firebase por defecto.
- Formalizar matriz completa de pruebas funcionales por rol.
