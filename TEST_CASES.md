# Casos de Prueba

## Objetivo

Documentar casos de prueba funcionales, técnicos y operativos para validar los flujos críticos del sistema sin depender únicamente de conocimiento tácito.

## Alcance actual documentado

- Login y carga de perfil
- Seguridad por rol en Firestore
- Pacientes
- Inventario
- Actas internas
- Reportes de visita
- Calibraciones

## Casos base sugeridos

| ID | Flujo | Rol | Precondición | Resultado esperado | Estado |
| --- | --- | --- | --- | --- | --- |
| TC-001 | Inicio de sesión con perfil válido | Cualquiera | Usuario existe en Auth y `users/{uid}.rol` válido | Ingresa al sistema y carga módulo según rol | Pendiente de ejecución |
| TC-002 | Inicio de sesión sin perfil Firestore | Cualquiera | Usuario existe en Auth pero no en `users/{uid}` | Se bloquea acceso y se informa error | Pendiente de ejecución |
| TC-003 | Crear paciente en sede autorizada | AUXILIAR_ADMINISTRATIVA | Usuario autenticado en su sede | Se crea paciente con contexto correcto | Cubierto parcialmente en reglas |
| TC-004 | Crear paciente fuera de sede autorizada | AUXILIAR_ADMINISTRATIVA | Usuario autenticado sin alcance sobre otra sede | Operación rechazada | Cubierto parcialmente en reglas |
| TC-005 | Ver equipo asignado activo | VISITADOR | Equipo con `asignadoActivo = true` | Lectura permitida | Cubierto parcialmente en reglas |
| TC-006 | Ver equipo no asignado | VISITADOR | Equipo con `asignadoActivo = false` | Lectura denegada | Cubierto parcialmente en reglas |
| TC-007 | Crear acta interna | INGENIERO_BIOMEDICO | Auxiliar destino válido y equipos transferibles | Acta creada y visible en flujo correspondiente | Pendiente de ejecución |
| TC-008 | Aceptar acta interna | AUXILIAR_ADMINISTRATIVA | Acta en estado `ENVIADA` | Acta pasa a `ACEPTADA` con trazabilidad | Pendiente de ejecución |
| TC-009 | Crear reporte de visita | VISITADOR | Asignación activa y datos mínimos válidos | Reporte creado con estado inicial y trazabilidad | Pendiente de ejecución |
| TC-010 | Cerrar reporte de visita | INGENIERO_BIOMEDICO | Reporte en `EN_PROCESO` | Reporte cambia a `CERRADO` con historial | Pendiente de ejecución |
| TC-011 | Registrar calibración con PDF | INGENIERO_BIOMEDICO | Equipo biomédico válido | Se guarda historial y certificado PDF | Pendiente de ejecución |

## Evidencia automatizada detectada en el repositorio

- Archivo: `tests/firestore.rules.test.mjs`
- Cobertura observada:
  creación de paciente por auxiliar, lectura global de gerencia, restricciones del visitador y transiciones de consultorio en equipos.

## Plantilla para nuevos casos

```md
### TC-XXX - Nombre del caso

- Tipo: Funcional | Seguridad | Integración | Regresión
- Rol: GERENCIA | AUXILIAR_ADMINISTRATIVA | INGENIERO_BIOMEDICO | VISITADOR
- Precondiciones:
  contexto mínimo requerido.
- Datos de prueba:
  entradas necesarias.
- Pasos:
  1. ...
  2. ...
  3. ...
- Resultado esperado:
  comportamiento esperado y validaciones.
- Evidencia:
  capturas, logs o referencia de prueba automatizada.
- Estado:
  Pendiente | Ejecutado | Bloqueado
```
