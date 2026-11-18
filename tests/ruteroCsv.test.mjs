import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { importarRuteroCsv } from '../pages/ruteroCsvImport.ts';

const projectId = 'demo-biocontrol-test';
const org = { empresaId: 'MEDICUC', sedeId: 'BUCARAMANGA' };
let env;

async function seed(path, data) {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data);
  });
}

before(async () => {
  if (!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) {
    throw new Error('Las pruebas requieren el emulador Firestore local en 127.0.0.1.');
  }
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed('users/visitador', { ...org, rol: 'VISITADOR', scope: [org] });
});

after(async () => {
  if (env) await env.cleanup();
});

test('CSV de plantilla actualiza solo campos autorizados en pacientes con y sin nombre', async () => {
  await seed('pacientes/legacy', { ...org, estado: 'ACTIVO', numeroDocumento: '111', diagnostico: 'PROTEGIDO' });
  await seed('pacientes/existente', { ...org, estado: 'ACTIVO', numeroDocumento: '222', nombreCompleto: 'NOMBRE ORIGINAL', zona: 'BGA1' });
  const db = env.authenticatedContext('visitador').firestore();
  const payloads = [];
  const csv = '\uFEFFDocumento,Nombre,BarrioMunicipio,Direccion,Telefono,Zona,diagnostico,rol\n' +
    '"111","NOMBRE EN CSV","CENTRO, NORTE","CALLE 1","55501","GIRON","CAMBIO","GERENCIA"\n' +
    '"222","OTRO NOMBRE","BARRIO","CALLE 2","55502","","CAMBIO","GERENCIA"';
  const resultado = await importarRuteroCsv(csv, [
    { id: 'legacy', numeroDocumento: '111' },
    { id: 'existente', numeroDocumento: '222', nombreCompleto: 'NOMBRE ORIGINAL' },
  ], async (id, cambios) => {
    payloads.push(cambios);
    await updateDoc(doc(db, `pacientes/${id}`), cambios);
  });

  assert.deepEqual(resultado.actualizados, [{ fila: 2, documento: '111' }, { fila: 3, documento: '222' }]);
  assert.deepEqual(resultado.fallidos, []);
  assert.deepEqual(resultado.noEncontrados, []);
  for (const cambios of payloads) {
    assert.deepEqual(Object.keys(cambios).sort(), ['barrio', 'direccion', 'telefono', 'zona']);
  }
  const legacy = (await assertSucceeds(getDoc(doc(db, 'pacientes/legacy')))).data();
  const existente = (await assertSucceeds(getDoc(doc(db, 'pacientes/existente')))).data();
  assert.equal(legacy.nombreCompleto, undefined);
  assert.equal(legacy.diagnostico, 'PROTEGIDO');
  assert.equal(legacy.barrio, 'CENTRO, NORTE');
  assert.equal(legacy.zona, 'GIRON');
  assert.equal(existente.nombreCompleto, 'NOMBRE ORIGINAL');
  assert.equal(existente.zona, null);
  await assertFails(updateDoc(doc(db, 'pacientes/legacy'), { nombreCompleto: 'NO AUTORIZADO' }));
});

test('Continúa tras errores de fila y escritura e identifica cada resultado', async () => {
  await seed('pacientes/uno', { ...org, estado: 'ACTIVO', numeroDocumento: '111', zona: null });
  await seed('pacientes/ajeno', { empresaId: 'OTRA', sedeId: 'OTRA', estado: 'ACTIVO', numeroDocumento: '222', zona: null });
  await seed('pacientes/tres', { ...org, estado: 'ACTIVO', numeroDocumento: '333', zona: null });
  const db = env.authenticatedContext('visitador').firestore();
  const csv = 'Documento;Nombre;Telefono;Zona\n' +
    '111;IGNORADO;100;GIRON\n' +
    '222;IGNORADO;200;BGA1\n' +
    '333;IGNORADO;300;ZONA INVALIDA\n' +
    '999;NO EXISTE;900;GIRON\n' +
    ';SIN DOCUMENTO;400;GIRON\n' +
    '333;IGNORADO;301;BGA2\n' +
    '333;FALTAN COLUMNAS';
  const resultado = await importarRuteroCsv(csv, [
    { id: 'uno', numeroDocumento: '111' },
    { id: 'ajeno', numeroDocumento: '222' },
    { id: 'tres', numeroDocumento: '333' },
  ], (id, cambios) => updateDoc(doc(db, `pacientes/${id}`), cambios));

  assert.deepEqual(resultado.actualizados, [{ fila: 2, documento: '111' }, { fila: 7, documento: '333' }]);
  assert.deepEqual(resultado.noEncontrados, [{ fila: 5, documento: '999' }]);
  assert.deepEqual(resultado.fallidos.map(({ fila, documento }) => ({ fila, documento })), [
    { fila: 3, documento: '222' }, { fila: 4, documento: '333' },
    { fila: 6, documento: '' }, { fila: 8, documento: '333' },
  ]);
  assert.match(resultado.fallidos[1].motivo, /Zona no válida/);
  assert.match(resultado.fallidos[2].motivo, /Falta el documento/);
  assert.match(resultado.fallidos[3].motivo, /cantidad de columnas/);
  assert.equal((await assertSucceeds(getDoc(doc(db, 'pacientes/uno')))).data().telefono, '100');
  assert.equal((await assertSucceeds(getDoc(doc(db, 'pacientes/tres')))).data().telefono, '301');
});

test('CSV con punto y coma, comillas y saltos de línea conserva el número real de fila', async () => {
  await seed('pacientes/uno', { ...org, estado: 'ACTIVO', numeroDocumento: '111', zona: null });
  await seed('pacientes/dos', { ...org, estado: 'ACTIVO', numeroDocumento: '222', zona: null });
  const db = env.authenticatedContext('visitador').firestore();
  const csv = 'Documento;Nombre;BarrioMunicipio;Zona\n' +
    '111;"NOMBRE";"CENTRO; NORTE\nSEGUNDA LINEA";BGA1\n' +
    '222;"OTRO";"BARRIO ""NUEVO""";GIRON';
  const resultado = await importarRuteroCsv(csv, [
    { id: 'uno', numeroDocumento: '111' }, { id: 'dos', numeroDocumento: '222' },
  ], (id, cambios) => updateDoc(doc(db, `pacientes/${id}`), cambios));
  assert.deepEqual(resultado.actualizados, [{ fila: 2, documento: '111' }, { fila: 4, documento: '222' }]);
  assert.equal((await assertSucceeds(getDoc(doc(db, 'pacientes/uno')))).data().barrio, 'CENTRO; NORTE\nSEGUNDA LINEA');
  assert.equal((await assertSucceeds(getDoc(doc(db, 'pacientes/dos')))).data().barrio, 'BARRIO "NUEVO"');
});

test('Rechaza encabezados insuficientes y comillas sin cerrar antes de escribir', async () => {
  let escrituras = 0;
  const actualizar = async () => { escrituras += 1; };
  await assert.rejects(importarRuteroCsv('Nombre,Telefono\nPACIENTE,123', [], actualizar), /columna Documento/);
  await assert.rejects(importarRuteroCsv('Documento,Nombre\n111,PACIENTE', [], actualizar), /columnas de rutero/);
  await assert.rejects(importarRuteroCsv('Documento,Nombre,Telefono\n111,"PACIENTE,123', [], actualizar), /comillas sin cerrar/);
  assert.equal(escrituras, 0);
});

test('Informa un paciente legacy sin zona si el CSV no contiene esa columna y continúa con otras filas', async () => {
  await seed('pacientes/sin_zona', { ...org, estado: 'ACTIVO', numeroDocumento: '111' });
  await seed('pacientes/con_zona', { ...org, estado: 'ACTIVO', numeroDocumento: '222', zona: null });
  const db = env.authenticatedContext('visitador').firestore();
  const resultado = await importarRuteroCsv('Documento,Nombre,Telefono\n111,IGNORADO,100\n222,IGNORADO,200', [
    { id: 'sin_zona', numeroDocumento: '111' }, { id: 'con_zona', numeroDocumento: '222' },
  ], (id, cambios) => updateDoc(doc(db, `pacientes/${id}`), cambios));

  assert.deepEqual(resultado.fallidos.map(({ fila, documento }) => ({ fila, documento })), [{ fila: 2, documento: '111' }]);
  assert.match(resultado.fallidos[0].motivo, /columna Zona/);
  assert.deepEqual(resultado.actualizados, [{ fila: 3, documento: '222' }]);
  const legacy = (await assertSucceeds(getDoc(doc(db, 'pacientes/sin_zona')))).data();
  assert.equal(legacy.nombreCompleto, undefined);
  assert.equal(legacy.telefono, undefined);
  assert.equal((await assertSucceeds(getDoc(doc(db, 'pacientes/con_zona')))).data().telefono, '200');
});
