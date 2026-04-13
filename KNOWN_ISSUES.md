# Incidencias Conocidas

## Objetivo

Registrar problemas confirmados, limitaciones actuales y observaciones operativas para facilitar soporte y priorización.

## Incidencias confirmadas

### 1. Cobertura de pruebas automatizadas parcial

- Estado: Abierto
- Impacto: Medio
- Descripción:
  existe arnés inicial para `firestore.rules`, pero no se encontró cobertura automatizada equivalente para todos los flujos de frontend, Storage o Cloud Functions.
- Referencia:
  `tests/firestore.rules.test.mjs`
- Acción sugerida:
  ampliar casos críticos por rol y por flujos transaccionales.

### 2. Referencia a `GEMINI_API_KEY` en configuración de Vite

- Estado: Pendiente por confirmar
- Impacto: Bajo
- Descripción:
  `vite.config.ts` expone `process.env.API_KEY` y `process.env.GEMINI_API_KEY`, pero en el análisis del repositorio no se identificó uso funcional directo en los módulos principales.
- Riesgo:
  puede inducir confusión en configuración local o documentación de entorno.
- Acción sugerida:
  confirmar si es remanente técnico o dependencia futura.

### 3. No se encontró versionado formal del producto

- Estado: Abierto
- Impacto: Bajo
- Descripción:
  `package.json` usa versión `0.0.0` y no se observó esquema formal de releases del producto.
- Acción sugerida:
  definir convención mínima de versionado documental o de releases.

## Problemas operativos frecuentes

- `Missing or insufficient permissions` por rol inválido, perfil faltante o reglas no desplegadas.
- Error de índice faltante en Firestore al introducir consultas nuevas o no desplegar `firestore.indexes.json`.
- Errores de Storage `401`, `403` o `412` por reglas, bucket o App Check.
- Dependencia de Java local para ejecutar `npm run test:rules`.

## Plantilla para nuevos registros

```md
### N. Título corto

- Estado: Abierto | En análisis | Mitigado | Cerrado
- Impacto: Bajo | Medio | Alto
- Descripción:
  detalle breve y verificable.
- Condición de reproducción:
  pasos mínimos o contexto donde ocurre.
- Riesgo:
  impacto técnico u operativo.
- Acción sugerida:
  siguiente paso recomendado.
- Responsable:
  Pendiente por asignar.
```
