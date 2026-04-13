# Contexto del Sistema

## Propósito del sistema

BioControl soporta la operación biomédica y administrativa asociada a inventario, pacientes, profesionales, asignaciones, visitas, actas, mantenimientos y calibraciones. El sistema prioriza trazabilidad, control por roles y consistencia de datos sobre Firebase.

## Módulos principales

- Autenticación y carga de perfil desde `users/{uid}`
- Dashboard
- Pacientes
- Profesionales
- Inventario de equipos
- Consultorios
- Mantenimientos
- Calibraciones
- Reportes de visitas
- Rutero del visitador
- Actas internas
- Informes
- Administración de usuarios

## Restricciones conocidas

- No existe auto-registro público.
- El acceso está bloqueado si el usuario de Firebase Auth no tiene documento en `users/{uid}` o si `rol` no es válido.
- Las reglas de Firestore y Functions restringen operaciones por `empresaId`, `sedeId` y, en ciertos casos, `scope`.
- Los cambios deben ser compatibles con datos legacy que pueden no incluir todos los campos recientes.
- Los activos sin `tipoActivo` deben seguir tratándose como biomédicos por compatibilidad.
- El visitador no debe modificar información clínica ni acceder a certificados de calibración.

## Decisiones importantes

- Frontend construido como SPA con router por hash en `App.tsx`.
- La mayor parte del acceso a datos del cliente está centralizado en `services/firestoreData.ts`.
- La lógica sensible de negocio y varias creaciones transaccionales viven en Cloud Functions.
- La seguridad no depende solo del frontend; se refuerza con `firestore.rules` y `storage.rules`.
- El proyecto Firebase por defecto es `biocontrol-43676`.
- La región estándar de Functions es `us-central1`.
- El sistema usa mayúsculas en varios campos operativos por decisión de negocio.

## Cosas sensibles que no se deben romper

- Login con usuario existente en Auth y perfil válido en `users/{uid}`.
- Actas de entrega con firmas y consistencia de campos.
- En acta de paciente, la sede debe mostrarse como `BUCARAMANGA`.
- Flujo de acta interna biomédico -> auxiliar con aceptación y firma.
- Captura de firma por visitador solo sobre asignaciones activas.
- Reportes de visita con estados `ABIERTO`, `EN_PROCESO` y `CERRADO`, incluyendo historial.
- Calibraciones con historial, costo y certificado PDF.
- Restricciones por rol:
  `GERENCIA` solo lectura, `VISITADOR` con alcance operativo controlado, `AUXILIAR_ADMINISTRATIVA` para gestión administrativa e `INGENIERO_BIOMEDICO` para inventario y validaciones técnicas.

## Referencias clave del repositorio

- [README.md](README.md)
- [docs/HANDOFF.md](docs/HANDOFF.md)
- [firestore.rules](firestore.rules)
- [storage.rules](storage.rules)
- [App.tsx](App.tsx)
- [services/firestoreData.ts](services/firestoreData.ts)
- [functions/src/index.ts](functions/src/index.ts)
