import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';

const PROJECT_ID = `biocontrol-storage-rules-${Date.now()}`;

const UIDS = {
  auxiliar: 'auxiliar_uid',
  biomedico: 'biomedico_uid',
  gerencia: 'gerencia_uid',
  visitador: 'visitador_uid',
};

let testEnv;

function roleForUid(uid) {
  if (uid === UIDS.auxiliar) return 'AUXILIAR_ADMINISTRATIVA';
  if (uid === UIDS.biomedico) return 'INGENIERO_BIOMEDICO';
  if (uid === UIDS.gerencia) return 'GERENCIA';
  if (uid === UIDS.visitador) return 'VISITADOR';
  return undefined;
}

function authStorage(uid, extraClaims = {}) {
  return testEnv.authenticatedContext(uid, {
    rol: roleForUid(uid),
    ...extraClaims,
  }).storage();
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
  });

  await seedDoc(`users/${UIDS.biomedico}`, {
    nombre: 'BIOMEDICO',
    rol: 'INGENIERO_BIOMEDICO',
    empresaId: 'MEDICUC',
    sedeId: 'BUCARAMANGA',
  });

  await seedDoc(`users/${UIDS.gerencia}`, {
    nombre: 'GERENCIA',
    rol: 'GERENCIA',
    empresaId: 'MEDICUC',
    sedeId: 'BUCARAMANGA',
    isGlobalRead: true,
  });

  await seedDoc(`users/${UIDS.visitador}`, {
    nombre: 'VISITADOR',
    rol: 'VISITADOR',
    empresaId: 'MEDICUC',
    sedeId: 'BUCARAMANGA',
  });
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
    },
    storage: {
      rules: readFileSync('storage.rules', 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
  await seedUsers();
});

after(async () => {
  await testEnv.cleanup();
});

test('Visitador puede subir foto de reporte a su propio uid', async () => {
  const storage = authStorage(UIDS.visitador);
  await assertSucceeds(
    storage
      .ref(`reportes_equipos/${UIDS.visitador}/rep1/foto.png`)
      .putString('fake-image', 'raw', { contentType: 'image/png' }),
  );
});

test('Auxiliar no puede subir foto de reporte a rutas del visitador', async () => {
  const storage = authStorage(UIDS.auxiliar);
  await assertFails(
    storage
      .ref(`reportes_equipos/${UIDS.auxiliar}/rep1/foto.png`)
      .putString('fake-image', 'raw', { contentType: 'image/png' }),
  );
});

test('Visitador no puede subir foto de reporte al uid de otro usuario', async () => {
  const storage = authStorage(UIDS.visitador);
  await assertFails(
    storage
      .ref(`reportes_equipos/${UIDS.auxiliar}/rep1/foto.png`)
      .putString('fake-image', 'raw', { contentType: 'image/png' }),
  );
});

test('Visitador no puede subir archivos con contentType inválido', async () => {
  const storage = authStorage(UIDS.visitador);
  await assertFails(
    storage
      .ref(`reportes_equipos/${UIDS.visitador}/rep1/archivo.pdf`)
      .putString('%PDF-1.7', 'raw', { contentType: 'application/pdf' }),
  );
});

test('Visitador puede subir foto de solicitud a su propio uid', async () => {
  const storage = authStorage(UIDS.visitador);
  await assertSucceeds(
    storage
      .ref(`solicitudes_equipos_paciente/${UIDS.visitador}/sol1/foto.jpeg`)
      .putString('fake-image', 'raw', { contentType: 'image/jpeg' }),
  );
});

test('Biomédico no puede subir foto de solicitud en rutas del visitador', async () => {
  const storage = authStorage(UIDS.biomedico);
  await assertFails(
    storage
      .ref(`solicitudes_equipos_paciente/${UIDS.biomedico}/sol1/foto.jpeg`)
      .putString('fake-image', 'raw', { contentType: 'image/jpeg' }),
  );
});

test('Biomédico puede leer foto de reporte existente', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context
      .storage()
      .ref(`reportes_equipos/${UIDS.visitador}/rep_read/foto.png`)
      .putString('fake-image', 'raw', { contentType: 'image/png' });
  });

  const storage = authStorage(UIDS.biomedico);
  await assertSucceeds(
    storage.ref(`reportes_equipos/${UIDS.visitador}/rep_read/foto.png`).getDownloadURL(),
  );
});
