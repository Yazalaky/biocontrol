# Operación y Soporte

## Operación diaria

- Confirmar acceso con usuarios ya provisionados en Firebase Auth.
- Verificar que cada usuario tenga perfil válido en `users/{uid}`.
- Operar en el contexto organizacional correcto (`empresaId` y `sedeId`).
- Supervisar creación de actas, reportes, mantenimientos y calibraciones según rol.
- Validar almacenamiento de archivos operativos en Storage cuando aplique.

## Monitoreo básico

- Revisar errores de permisos reportados por usuarios.
- Consultar logs de Functions cuando falle un flujo transaccional:

```bash
npm --prefix functions run logs
```

- Confirmar despliegue vigente de reglas e índices si aparece error de acceso o consulta.
- Verificar consistencia de firmas, actas y trazabilidad en documentos críticos.

## Problemas comunes

### Usuario no puede ingresar

- Verificar autenticación en Firebase Auth.
- Confirmar existencia del documento `users/{uid}`.
- Confirmar que `rol` sea válido.

### Error `Missing or insufficient permissions`

- Revisar rol del usuario.
- Revisar `empresaId`, `sedeId` y `scope`.
- Confirmar despliegue actual de `firestore.rules`.

### Error por índice faltante

- Revisar mensaje de Firestore.
- Crear o desplegar `firestore.indexes.json`.

### Error al cargar archivos

- Revisar `storage.rules`.
- Confirmar bucket configurado en variables de entorno.
- Verificar restricciones de tipo MIME y tamaño.

### Flujo transaccional falla

- Revisar logs de Cloud Functions.
- Confirmar contexto organizacional del usuario y de la entidad operada.

## Pasos de soporte inicial

1. Identificar rol del usuario afectado.
2. Confirmar módulo y flujo exacto donde ocurre el problema.
3. Revisar si el error es de frontend, reglas, índices o Cloud Functions.
4. Validar existencia y estructura del documento en Firestore involucrado.
5. Revisar si el problema afecta solo una sede o todo el sistema.
6. Escalar con evidencia mínima:
   usuario, rol, sede, hora, módulo y mensaje de error.

## Referencias operativas

- [HANDOFF.md](HANDOFF.md)
- [docs/DEPLOY.md](DEPLOY.md)
- [KNOWN_ISSUES.md](../KNOWN_ISSUES.md)
- [TEST_CASES.md](../TEST_CASES.md)
