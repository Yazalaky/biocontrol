import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = `biocontrol-rules-${Date.now()}`;

const UIDS = {
  auxiliar: 'auxiliar_uid',
  biomedico: 'biomedico_uid',
  gerencia: 'gerencia_uid',
  visitador: 'visitador_uid',
};

let testEnv;

function authDb(uid) {
  return testEnv.authenticatedContext(uid).firestore();
}

async function seedDoc(path, data) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, path), data);
  });
}

async function seedUsers() {
  await seedDoc(`users/${UIDS.auxiliar}`, {
    nombre: 'AUXILIAR MEDICUC',
    rol: 'AUXILIAR_ADMINISTRATIVA',
    empresaId: 'MEDICUC',
    sedeId: 'BUCARAMANGA',
    scope: [{ empresaId: 'MEDICUC', sedeId: 'BUCARAMANGA' }],
    isGlobalRead: false,
  });

  await seedDoc(`users/${UIDS.biomedico}`, {
    nombre: 'BIOMEDICO MULTISEDE',
    rol: 'INGENIERO_BIOMEDICO',
    empresaId: 'MEDICUC',
    sedeId: 'BUCARAMANGA',
    scope: [
      { empresaId: 'MEDICUC', sedeId: 'BUCARAMANGA' },
      { empresaId: 'ALIADOS', sedeId: 'ALIADOS_CUC' },
    ],
    isGlobalRead: false,
  });

  await seedDoc(`users/${UIDS.gerencia}`, {
    nombre: 'GERENCIA',
    rol: 'GERENCIA',
    empresaId: 'MEDICUC',
    sedeId: 'BUCARAMANGA',
    scope: [{ empresaId: 'MEDICUC', sedeId: 'BUCARAMANGA' }],
    isGlobalRead: true,
  });

  await seedDoc(`users/${UIDS.visitador}`, {
    nombre: 'VISITADOR',
    rol: 'VISITADOR',
    empresaId: 'MEDICUC',
    sedeId: 'BUCARAMANGA',
    scope: [{ empresaId: 'MEDICUC', sedeId: 'BUCARAMANGA' }],
    isGlobalRead: false,
  });
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seedUsers();
});

after(async () => {
  await testEnv.cleanup();
});

test('Auxiliar puede crear paciente en su sede', async () => {
  const db = authDb(UIDS.auxiliar);
  await assertSucceeds(
    setDoc(doc(db, 'pacientes/p1'), {
      empresaId: 'MEDICUC',
      sedeId: 'BUCARAMANGA',
      estado: 'ACTIVO',
      numeroDocumento: '123',
      nombreCompleto: 'PACIENTE PRUEBA',
    }),
  );
});

test('Auxiliar no puede crear paciente en otra sede/empresa', async () => {
  const db = authDb(UIDS.auxiliar);
  await assertFails(
    setDoc(doc(db, 'pacientes/p2'), {
      empresaId: 'ALIADOS',
      sedeId: 'ALIADOS_CUC',
      estado: 'ACTIVO',
      numeroDocumento: '456',
      nombreCompleto: 'PACIENTE OTRA SEDE',
    }),
  );
});

test('Gerencia puede leer equipos fuera de su sede (lectura global)', async () => {
  await seedDoc('equipos/eq_aliados', {
    empresaId: 'ALIADOS',
    sedeId: 'ALIADOS_CUC',
    estado: 'DISPONIBLE',
    asignadoActivo: false,
    nombre: 'EQUIPO ALIADOS',
  });

  const db = authDb(UIDS.gerencia);
  await assertSucceeds(getDoc(doc(db, 'equipos/eq_aliados')));
});

test('Visitador solo lee equipos con asignadoActivo=true', async () => {
  await seedDoc('equipos/eq_true', {
    empresaId: 'MEDICUC',
    sedeId: 'BUCARAMANGA',
    estado: 'ASIGNADO',
    asignadoActivo: true,
    nombre: 'EQUIPO ACTIVO',
  });
  await seedDoc('equipos/eq_false', {
    empresaId: 'MEDICUC',
    sedeId: 'BUCARAMANGA',
    estado: 'DISPONIBLE',
    asignadoActivo: false,
    nombre: 'EQUIPO INACTIVO',
  });

  const db = authDb(UIDS.visitador);
  await assertSucceeds(getDoc(doc(db, 'equipos/eq_true')));
  await assertFails(getDoc(doc(db, 'equipos/eq_false')));
});

test('Biomédico: asignación inicial de consultorio permitida; mover directo bloqueado', async () => {
  await seedDoc('equipos/eq_consultorio', {
    empresaId: 'ALIADOS',
    sedeId: 'ALIADOS_CUC',
    estado: 'DISPONIBLE',
    nombre: 'EQUIPO PRUEBA',
  });

  const db = authDb(UIDS.biomedico);
  await assertSucceeds(
    updateDoc(doc(db, 'equipos/eq_consultorio'), {
      consultorioId: 'c1',
    }),
  );

  await assertFails(
    updateDoc(doc(db, 'equipos/eq_consultorio'), {
      consultorioId: 'c2',
    }),
  );
});

test('Biomédico: equipo dado de baja no se puede asignar a consultorio', async () => {
  await seedDoc('equipos/eq_baja', {
    empresaId: 'ALIADOS',
    sedeId: 'ALIADOS_CUC',
    estado: 'DADO_DE_BAJA',
    nombre: 'EQUIPO BAJA',
  });

  const db = authDb(UIDS.biomedico);
  await assertFails(
    updateDoc(doc(db, 'equipos/eq_baja'), {
      consultorioId: 'c1',
    }),
  );
});

test('Documento users sin rol válido no obtiene acceso', async () => {
  await seedDoc('users/sin_rol', {
    nombre: 'SIN ROL',
    empresaId: 'MEDICUC',
    sedeId: 'BUCARAMANGA',
  });
  await seedDoc('equipos/eq_public', {
    empresaId: 'MEDICUC',
    sedeId: 'BUCARAMANGA',
    estado: 'DISPONIBLE',
    asignadoActivo: false,
    nombre: 'EQUIPO TEST',
  });

  const db = authDb('sin_rol');
  await assertFails(getDoc(doc(db, 'equipos/eq_public')));
  assert.ok(true);
});
