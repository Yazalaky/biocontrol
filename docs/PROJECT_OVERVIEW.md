# Resumen del Proyecto

## Problema que resuelve

BioControl atiende la necesidad de centralizar procesos biomédicos y administrativos que, manejados de forma manual o dispersa, generan errores de inventario, pérdida de trazabilidad, demoras en seguimiento y baja visibilidad del estado de pacientes, equipos, visitas, mantenimientos y entregas.

## Usuarios y áreas usuarias

- Gerencia
- Área administrativa y coordinación operativa
- Ingeniería biomédica
- Visitadores en operación de campo

Roles implementados en el sistema:

- `GERENCIA`
- `AUXILIAR_ADMINISTRATIVA`
- `INGENIERO_BIOMEDICO`
- `VISITADOR`

## Valor para la operación

- Centraliza información crítica en un solo sistema.
- Aplica control de acceso por rol y por contexto organizacional.
- Mantiene trazabilidad en actas, firmas, reportes y mantenimientos.
- Reduce reprocesos y errores derivados de registros manuales.
- Permite seguimiento operativo sobre inventario, entregas, calibraciones y visitas.

## Alcance actual

- Autenticación con Firebase Auth y validación de perfil en Firestore.
- Gestión de pacientes y profesionales.
- Gestión de inventario biomédico y activos relacionados.
- Asignaciones de equipos a pacientes y profesionales.
- Actas de entrega y actas internas.
- Captura y consulta de firmas.
- Rutero y reportes de visita.
- Mantenimientos.
- Calibraciones con historial, costo y certificado PDF.
- Gestión de consultorios para contexto Aliados.
- Dashboard e informes operativos.

## Fuera de alcance

- Registro público de usuarios.
- Edición libre de datos sin restricción por rol.
- Migraciones destructivas automáticas sobre datos existentes.
- Modificación de información clínica por el rol visitador.
- Acceso del visitador a certificados de calibración.
- Procedimiento formal de rollback automatizado desde el repositorio.

## Estado actual

- Solución operativa con flujos críticos ya definidos.
- Evolución reciente en contexto organizacional multisede y gestión por consultorios.
- Pendiente por confirmar:
  nomenclatura formal de versión de producto y calendario oficial de releases.
