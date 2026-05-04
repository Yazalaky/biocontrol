# Plan de Modernización de BioControl en Producción

Fecha base: 2026-04-20

## Objetivo

Definir una guía de modernización segura para BioControl considerando que el sistema ya opera en producción. Este documento no autoriza cambios automáticos; fija el criterio para priorizar mejoras sin comprometer la operación.

## Principio rector

La modernización debe ejecutarse por capas:

1. Proteger operación.
2. Mejorar verificabilidad y disciplina técnica.
3. Modularizar internamente sin alterar comportamiento observable.
4. Reforzar contratos, seguridad y cobertura.
5. Solo después evaluar cambios arquitectónicos mayores.

No se recomienda una modernización tipo big bang.

## Fase 0 - Blindaje operativo

Objetivo: reducir riesgo antes de tocar arquitectura o refactorizar módulos sensibles.

Incluye:
- Definir ambientes formales `dev`, `staging` y `prod`.
- Establecer baseline técnico antes de cambios estructurales.
- Documentar rollback de `hosting`, `functions`, `firestore.rules`, `storage.rules` y `firestore.indexes.json`.
- Confirmar responsables de validación post-deploy.
- Confirmar acceso a logs, backups y procedimiento de soporte.
- Identificar flujos críticos por rol para validación posterior.

Implicaciones:
- Riesgo bajo.
- Poco impacto funcional.
- Alta rentabilidad operativa.

## Fase 1 - Higiene técnica sin cambio funcional

Objetivo: volver el proyecto verificable, repetible y menos dependiente de conocimiento tácito.

Incluye:
- CI mínima con `build`, `lint`, `typecheck`, `test:rules` y build de `functions`.
- Lint para frontend.
- Endurecimiento gradual de TypeScript en frontend.
- Corrección de drift documental.
- Claridad sobre variables de entorno y dependencias cargadas por npm vs CDN.
- Limpieza de artefactos ambiguos o legacy si se confirma que no se usan.

Implicaciones:
- Riesgo bajo.
- Puede revelar errores latentes ya existentes.
- Aumenta control de calidad antes de merge o deploy.

## Fase 2 - Modularización interna controlada

Objetivo: reducir acoplamiento y tamaño de los archivos más críticos sin cambiar lógica de negocio.

Prioridad sugerida:
- `functions/src/index.ts`
- `services/firestoreData.ts`
- `pages/Inventory.tsx`
- `pages/Visits.tsx`
- `pages/Patients.tsx`
- `pages/Professionals.tsx`

Incluye:
- Extraer helpers, validadores y servicios por dominio.
- Separar funciones de backend por módulos.
- Mover lógica compleja de UI a hooks o helpers.
- Mantener contratos actuales y comportamiento observable.

Implicaciones:
- Riesgo medio.
- Exige pruebas de regresión por flujo crítico.
- No debe mezclarse con nuevas funcionalidades.

## Fase 3 - Contratos, seguridad y pruebas

Objetivo: alinear mejor frontend, reglas, backend y datos reales.

Incluye:
- Documentar Firestore colección por colección.
- Documentar contratos de Cloud Functions.
- Revisar consistencia entre validaciones de UI, rules y backend.
- Estandarizar defaults seguros para datos legacy.
- Ampliar pruebas de reglas, Functions y flujos críticos por rol.

Implicaciones:
- Riesgo medio a medio-alto.
- Puede destapar inconsistencias reales de datos o permisos.
- Puede requerir despliegues coordinados de frontend, Functions, reglas e índices.

## Fase 4 - Normalización de dependencias y build

Objetivo: reducir fragilidad del frontend por dependencias externas no integradas de forma estándar.

Incluye:
- Revisar dependencias cargadas por CDN e importmap.
- Normalizar `html2canvas`, `jsPDF`, Tailwind y recursos relacionados.
- Dejar el build autocontenido y reproducible.

Implicaciones:
- Riesgo medio.
- Requiere validación fuerte en impresión, actas, PDFs y dashboard.

## Fase 5 - Evolución arquitectónica

Objetivo: preparar el sistema para crecimiento futuro si el roadmap lo exige.

Posibles líneas:
- Backend más modular por dominios.
- Contratos/tipos compartidos entre cliente y backend.
- Mejor observabilidad y auditoría.
- Separación más clara de bounded contexts operativos.

Implicaciones:
- Riesgo alto.
- No recomendable como prioridad inmediata.
- Debe justificarse por crecimiento real del producto o del equipo.

## Qué sí conviene hacer ya

- Completar Fase 0.
- Completar Fase 1.
- Iniciar Fase 2 de forma acotada y controlada.

## Qué no conviene hacer ya

- Reescribir masivamente frontend o navegación.
- Ejecutar migraciones destructivas automáticas.
- Mezclar refactor grande con cambios funcionales.
- Reemplazar Firebase sin una razón estratégica fuerte.

## Implicaciones globales por estar en producción

- Todo cambio técnico compite con estabilidad operativa.
- La validación manual por rol y flujo seguirá siendo obligatoria.
- Es esperable que aparezcan defectos latentes al introducir controles más estrictos.
- La modernización puede reducir temporalmente la velocidad de entrega.
- La inversión más rentable suele ser crear ambiente intermedio y disciplina de release antes que reescribir código.

## Regla de decisión

Ante cualquier propuesta de mejora:

1. Confirmar si cambia comportamiento observable.
2. Confirmar si requiere despliegue coordinado.
3. Confirmar cómo se valida por rol afectado.
4. Confirmar cómo se revierte si falla.

Si una mejora no responde bien a esas cuatro preguntas, no debería entrar todavía a producción.
