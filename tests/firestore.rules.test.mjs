import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { onLog } from 'firebase/app';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { arrayUnion, deleteDoc, deleteField, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'demo-biocontrol-test';

const UIDS = {
  auxiliar: 'auxiliar_uid',
  biomedico: 'biomedico_uid',
  gerencia: 'gerencia_uid',
  visitador: 'visitador_uid',
};

let testEnv;
let expressionLimitWarnings = [];

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
  if (!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) {
    throw new Error('Las pruebas requieren el emulador Firestore local en 127.0.0.1.');
  }
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  });
  onLog((entry) => {
    if (entry.type === '@firebase/firestore' && /maximum of 1000 expressions/i.test(entry.message)) {
      expressionLimitWarnings.push(entry.message);
    }
  }, { level: 'warn' });
});

beforeEach(async () => {
  expressionLimitWarnings = [];
  await testEnv.clearFirestore();
  await seedUsers();
});

afterEach(() => {
  assert.deepEqual(expressionLimitWarnings, [], 'Una solicitud alcanzó el límite de expresiones de Rules.');
});

after(async () => {
  onLog(null);
  if (testEnv) await testEnv.cleanup();
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

test('Visitador puede capturar firma solo en campos permitidos de asignación activa', async () => {
  await seedDoc('asignaciones/asg_visitador_ok', {
    empresaId: 'MEDICUC',
    sedeId: 'BUCARAMANGA',
    estado: 'ACTIVA',
    idPaciente: 'p1',
    idEquipo: 'e1',
  });

  const db = authDb(UIDS.visitador);
  await assertSucceeds(
    updateDoc(doc(db, 'asignaciones/asg_visitador_ok'), {
      firmaPacienteEntrega: 'data:image/png;base64,AAA',
      firmaPacienteEntregaCapturadaAt: new Date().toISOString(),
      firmaPacienteEntregaCapturadaPorUid: UIDS.visitador,
      firmaPacienteEntregaCapturadaPorNombre: 'VISITADOR',
    }),
  );
});

test('Visitador no puede modificar campos no permitidos en asignación activa', async () => {
  const data = {
    empresaId: 'MEDICUC',
    sedeId: 'BUCARAMANGA',
    estado: 'ACTIVA',
    idPaciente: 'p1',
    idEquipo: 'e1',
  };
  await seedDoc('asignaciones/asg_visitador_denied', data);

  const db = authDb(UIDS.visitador);
  const ref = doc(db, 'asignaciones/asg_visitador_denied');
  await assertSucceeds(updateDoc(ref, firmaEntrega));
  await seedDoc('asignaciones/asg_visitador_denied', data);
  await assertFails(
    updateDoc(ref, {
      ...firmaEntrega,
      observacionesEntrega: 'INTENTO NO PERMITIDO',
    }),
  );
});

test('Auxiliar no puede cambiar empresa o sede de un paciente existente', async () => {
  await seedDoc('pacientes/p_scope_locked', {
    empresaId: 'MEDICUC',
    sedeId: 'BUCARAMANGA',
    estado: 'ACTIVO',
    numeroDocumento: '999',
    nombreCompleto: 'PACIENTE CONTEXTO',
  });

  const db = authDb(UIDS.auxiliar);
  await assertFails(
    updateDoc(doc(db, 'pacientes/p_scope_locked'), {
      empresaId: 'ALIADOS',
      sedeId: 'ALIADOS_CUC',
    }),
  );
});

test('Gerencia no puede crear equipos por escritura directa', async () => {
  const db = authDb(UIDS.gerencia);
  await assertFails(
    setDoc(doc(db, 'equipos/eq_gerencia_write'), {
      empresaId: 'MEDICUC',
      sedeId: 'BUCARAMANGA',
      estado: 'DISPONIBLE',
      asignadoActivo: false,
      nombre: 'EQUIPO GERENCIA',
    }),
  );
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

test('Biomédico puede leer equipos en cualquier sede de su scope', async () => {
  await seedDoc('equipos/eq_scope_primary', {
    empresaId: 'MEDICUC',
    sedeId: 'BUCARAMANGA',
    estado: 'DISPONIBLE',
    asignadoActivo: false,
    nombre: 'EQUIPO SCOPE PRINCIPAL',
  });
  await seedDoc('equipos/eq_scope_secondary', {
    empresaId: 'ALIADOS',
    sedeId: 'ALIADOS_CUC',
    estado: 'DISPONIBLE',
    asignadoActivo: false,
    nombre: 'EQUIPO SCOPE SECUNDARIO',
  });

  const db = authDb(UIDS.biomedico);
  await assertSucceeds(getDoc(doc(db, 'equipos/eq_scope_primary')));
  await assertSucceeds(getDoc(doc(db, 'equipos/eq_scope_secondary')));
});

test('Biomédico no puede leer equipos fuera de su scope', async () => {
  await seedDoc('equipos/eq_outside_scope', {
    empresaId: 'OTRA',
    sedeId: 'CENTRO',
    estado: 'DISPONIBLE',
    asignadoActivo: false,
    nombre: 'EQUIPO FUERA DE SCOPE',
  });

  const db = authDb(UIDS.biomedico);
  await assertFails(getDoc(doc(db, 'equipos/eq_outside_scope')));
});

test('Biomédico puede crear equipos en cualquier sede de su scope', async () => {
  const db = authDb(UIDS.biomedico);
  await assertSucceeds(
    setDoc(doc(db, 'equipos/eq_new_scope'), {
      empresaId: 'ALIADOS',
      sedeId: 'ALIADOS_CUC',
      estado: 'DISPONIBLE',
      asignadoActivo: false,
      nombre: 'EQUIPO NUEVO SCOPE',
    }),
  );
});

test('Biomédico no puede crear equipos fuera de su scope', async () => {
  const db = authDb(UIDS.biomedico);
  await assertFails(
    setDoc(doc(db, 'equipos/eq_new_outside_scope'), {
      empresaId: 'OTRA',
      sedeId: 'CENTRO',
      estado: 'DISPONIBLE',
      asignadoActivo: false,
      nombre: 'EQUIPO NUEVO FUERA SCOPE',
    }),
  );
});

test('Biomédico no puede actualizar equipos fuera de su scope', async () => {
  await seedDoc('equipos/eq_update_outside_scope', {
    empresaId: 'OTRA',
    sedeId: 'CENTRO',
    estado: 'DISPONIBLE',
    asignadoActivo: false,
    nombre: 'EQUIPO UPDATE FUERA SCOPE',
  });

  const db = authDb(UIDS.biomedico);
  await assertFails(
    updateDoc(doc(db, 'equipos/eq_update_outside_scope'), {
      consultorioId: 'c1',
    }),
  );
});

test('Biomédico no puede eliminar equipos fuera de su scope', async () => {
  await seedDoc('equipos/eq_delete_outside_scope', {
    empresaId: 'OTRA',
    sedeId: 'CENTRO',
    estado: 'DISPONIBLE',
    asignadoActivo: false,
    nombre: 'EQUIPO DELETE FUERA SCOPE',
  });

  const db = authDb(UIDS.biomedico);
  await assertFails(deleteDoc(doc(db, 'equipos/eq_delete_outside_scope')));
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

// Cada caso ejercita una de las ocho listas de campos de A01. Los valores son
// sintéticos y los intentos maliciosos acompañan una operación válida del rol.
const org = { empresaId: 'MEDICUC', sedeId: 'BUCARAMANGA' };
const firmaEntrega = {
  firmaPacienteEntrega: 'data:image/png;base64,AAA',
  firmaPacienteEntregaCapturadaAt: '2026-11-17T10:00:00.000Z',
  firmaPacienteEntregaCapturadaPorUid: UIDS.visitador,
  firmaPacienteEntregaCapturadaPorNombre: 'VISITADOR',
};
const reporteBase = {
  ...org,
  idPaciente: 'paciente_sintetico',
  creadoPorUid: UIDS.visitador,
  historial: [{ estado: 'ABIERTO', nota: 'REGISTRO INICIAL' }],
  vistoPorVisitadorAt: null,
};
const casosCampos = [
  {
    nombre: 'visitador actualiza datos de rutero',
    uid: UIDS.visitador,
    path: 'pacientes/campos',
    data: { ...org, estado: 'ACTIVO', zona: 'BGA1', diagnostico: 'DATO CLINICO' },
    patch: { telefono: '5550101', barrio: 'CENTRO', direccion: 'CALLE 1', zona: 'BGA2' },
    protegido: 'diagnostico',
  },
  {
    nombre: 'visitador captura firma de entrega',
    uid: UIDS.visitador,
    path: 'asignaciones/campos',
    data: { ...org, estado: 'ACTIVA', idPaciente: 'paciente_sintetico', idEquipo: 'equipo_sintetico' },
    patch: firmaEntrega,
    protegido: 'idPaciente',
  },
  {
    nombre: 'biomédico actualiza calibración',
    uid: UIDS.biomedico,
    path: 'equipos/campos/calibraciones/cal1',
    data: { ...org, equipoId: 'campos', fecha: '2026-11-17', costo: '10' },
    patch: { costo: '20', observaciones: 'CONTROL' },
    protegido: 'equipoId',
    equipo: true,
  },
  {
    nombre: 'biomédico inicia reporte',
    uid: UIDS.biomedico,
    path: 'reportes_equipos/campos',
    data: { ...reporteBase, estado: 'ABIERTO' },
    patch: { estado: 'EN_PROCESO', diagnostico: 'REVISION', enProcesoPorUid: UIDS.biomedico },
    protegido: 'idPaciente',
  },
  {
    nombre: 'biomédico actualiza reporte en proceso',
    uid: UIDS.biomedico,
    path: 'reportes_equipos/campos',
    data: { ...reporteBase, estado: 'EN_PROCESO' },
    patch: { diagnostico: 'REVISION', planReparacion: 'PLAN' },
    protegido: 'idPaciente',
  },
  {
    nombre: 'biomédico cierra reporte',
    uid: UIDS.biomedico,
    path: 'reportes_equipos/campos',
    data: { ...reporteBase, estado: 'EN_PROCESO' },
    patch: { estado: 'CERRADO', cierreNotas: 'RESUELTO', cerradoPorUid: UIDS.biomedico },
    protegido: 'idPaciente',
  },
  {
    nombre: 'visitador marca su reporte cerrado como visto',
    uid: UIDS.visitador,
    path: 'reportes_equipos/campos',
    data: { ...reporteBase, estado: 'CERRADO' },
    patch: { vistoPorVisitadorAt: '2026-11-17T10:00:00.000Z' },
    protegido: 'idPaciente',
  },
  {
    nombre: 'biomédico aprueba solicitud',
    uid: UIDS.biomedico,
    path: 'solicitudes_equipos_paciente/campos',
    data: {
      ...org,
      estado: 'PENDIENTE',
      creadoPorUid: UIDS.visitador,
      idPaciente: 'paciente_sintetico',
      tipoPropiedad: 'PACIENTE',
      pacienteNombre: 'PACIENTE ORIGINAL',
    },
    patch: {
      estado: 'APROBADA',
      aprobadoPorUid: UIDS.biomedico,
      aprobadoPorNombre: 'BIOMEDICO',
      aprobadoAt: '2026-11-17T10:00:00.000Z',
      equipoId: 'equipo_sintetico',
    },
    protegido: 'pacienteNombre',
  },
];

async function seedCaso(caso, contexto = org) {
  if (caso.equipo) {
    await seedDoc('equipos/campos', { ...contexto, tipoActivo: 'BIOMEDICO' });
  }
  await seedDoc(caso.path, { ...caso.data, ...contexto });
}

for (const caso of casosCampos) {
  for (const [operacion, cambios] of [
    ['agregar campo no autorizado', { campoNoAutorizado: 'VALOR' }],
    ['modificar campo protegido', { [caso.protegido]: 'ALTERADO' }],
    ['eliminar campo protegido', { [caso.protegido]: deleteField() }],
  ]) {
    test(`${caso.nombre}: rechaza ${operacion}`, async () => {
      await seedCaso(caso);
      const ref = doc(authDb(caso.uid), caso.path);
      // Mismo rol, documento y transición: primero probar el control positivo.
      await assertSucceeds(updateDoc(ref, caso.patch));
      await seedCaso(caso);
      const original = (await assertSucceeds(getDoc(ref))).data();
      await assertFails(updateDoc(ref, { ...caso.patch, ...cambios }));
      assert.deepEqual((await assertSucceeds(getDoc(ref))).data(), original);
    });
  }

  test(`${caso.nombre}: permite reenviar un campo protegido con el mismo valor`, async () => {
    await seedCaso(caso);
    const ref = doc(authDb(caso.uid), caso.path);
    await assertSucceeds(updateDoc(ref, { ...caso.patch, [caso.protegido]: caso.data[caso.protegido] }));
  });

  test(`${caso.nombre}: permite la operación al rol autorizado`, async () => {
    await seedCaso(caso);
    const ref = doc(authDb(caso.uid), caso.path);
    await assertSucceeds(updateDoc(ref, caso.patch));
    await seedCaso(caso);
    const otroRol = caso.uid === UIDS.visitador ? UIDS.biomedico : UIDS.visitador;
    await assertFails(updateDoc(doc(authDb(otroRol), caso.path), caso.patch));
  });

  test(`${caso.nombre}: no puede modificar documentos fuera de su sede o scope`, async () => {
    await seedCaso(caso);
    await assertSucceeds(updateDoc(doc(authDb(caso.uid), caso.path), caso.patch));
    await seedCaso(caso, { empresaId: 'OTRA', sedeId: 'CENTRO' });
    await assertFails(updateDoc(doc(authDb(caso.uid), caso.path), caso.patch));
  });

  test(`${caso.nombre}: Gerencia lee globalmente pero no actualiza`, async () => {
    await seedCaso(caso);
    await assertSucceeds(updateDoc(doc(authDb(caso.uid), caso.path), caso.patch));
    await seedCaso(caso, { empresaId: 'ALIADOS', sedeId: 'ALIADOS_CUC' });
    const ref = doc(authDb(UIDS.gerencia), caso.path);
    await assertSucceeds(getDoc(ref));
    await assertFails(updateDoc(ref, caso.patch));
    await assertFails(deleteDoc(ref));
  });
}

test('Rutero permite agregar y modificar sus campos sin exigir datos legacy opcionales', async () => {
  await seedDoc('pacientes/rutero_legacy', { ...org, estado: 'ACTIVO', zona: null });
  const ref = doc(authDb(UIDS.visitador), 'pacientes/rutero_legacy');
  await assertSucceeds(updateDoc(ref, { telefono: '5550101', barrio: 'CENTRO' }));
  await assertSucceeds(updateDoc(ref, { telefono: '5550102', zona: 'GIRON' }));
});

test('La firma de entrega exige asignación activa, sin firma previa y de la misma sede', async () => {
  const db = authDb(UIDS.visitador);
  const casos = [
    ['inactiva', { ...org, estado: 'FINALIZADA' }],
    ['firmada', { ...org, estado: 'ACTIVA', firmaPacienteEntrega: 'FIRMA PREVIA' }],
    ['otra_sede', { empresaId: 'ALIADOS', sedeId: 'ALIADOS_CUC', estado: 'ACTIVA' }],
  ];
  for (const [id, data] of casos) {
    await seedDoc(`asignaciones/${id}`, { ...org, estado: 'ACTIVA' });
    await assertSucceeds(updateDoc(doc(db, `asignaciones/${id}`), firmaEntrega));
    await seedDoc(`asignaciones/${id}`, data);
    await assertFails(updateDoc(doc(db, `asignaciones/${id}`), firmaEntrega));
  }
});

test('La firma de entrega exige los campos de captura y el UID del visitador', async () => {
  await seedDoc('asignaciones/firma_obligatoria', { ...org, estado: 'ACTIVA' });
  const ref = doc(authDb(UIDS.visitador), 'asignaciones/firma_obligatoria');
  const { firmaPacienteEntregaCapturadaAt: _omitida, ...sinFecha } = firmaEntrega;
  await assertSucceeds(updateDoc(ref, firmaEntrega));
  await seedDoc('asignaciones/firma_obligatoria', { ...org, estado: 'ACTIVA' });
  await assertFails(updateDoc(ref, sinFecha));
  await assertFails(updateDoc(ref, { ...firmaEntrega, firmaPacienteEntregaCapturadaPorUid: 'otro_uid' }));
});

for (const [estado, patch] of [
  ['ABIERTO', { estado: 'EN_PROCESO' }],
  ['EN_PROCESO', { diagnostico: 'REVISION' }],
  ['EN_PROCESO', { estado: 'CERRADO' }],
]) {
  test(`Reporte ${estado}: no se puede borrar o anular historial existente durante ${JSON.stringify(patch)}`, async () => {
    await seedDoc('reportes_equipos/historial', { ...reporteBase, estado });
    const ref = doc(authDb(UIDS.biomedico), 'reportes_equipos/historial');
    await assertSucceeds(updateDoc(ref, { ...patch, historial: [...reporteBase.historial, { nota: 'AVANCE' }] }));
    await seedDoc('reportes_equipos/historial', { ...reporteBase, estado });
    await assertFails(updateDoc(ref, { ...patch, historial: deleteField() }));
    await assertFails(updateDoc(ref, { ...patch, historial: null }));
  });
}

test('Reporte legacy sin historial admite una transición legítima', async () => {
  await seedDoc('reportes_equipos/legacy', { ...org, estado: 'ABIERTO' });
  await assertSucceeds(updateDoc(doc(authDb(UIDS.biomedico), 'reportes_equipos/legacy'), {
    estado: 'EN_PROCESO',
    diagnostico: 'REVISION',
  }));
});

test('Auxiliar mantiene la edición ordinaria de paciente en su sede', async () => {
  await seedDoc('pacientes/auxiliar', { ...org, estado: 'ACTIVO', diagnostico: 'ANTERIOR' });
  await assertSucceeds(updateDoc(doc(authDb(UIDS.auxiliar), 'pacientes/auxiliar'), { diagnostico: 'ACTUAL' }));
});

for (const [estado, patch] of [
  ['ABIERTO', { estado: 'EN_PROCESO' }],
  ['EN_PROCESO', { diagnostico: 'REVISION' }],
  ['EN_PROCESO', { estado: 'CERRADO' }],
]) {
  for (const [accion, cambiar] of [
    ['eliminar entrada', (historial) => historial.slice(1)],
    ['modificar entrada', (historial) => [{ ...historial[0], nota: 'ALTERADA' }, historial[1]]],
    ['reordenar entradas', (historial) => [...historial].reverse()],
    ['vaciar historial', () => []],
    ['sustituir entrada por duplicado', (historial) => [historial[0], historial[0]]],
  ]) {
    test(`Reporte ${estado}: impide ${accion} al aplicar ${JSON.stringify(patch)}`, async () => {
      const historial = [
        { estado: 'ABIERTO', nota: 'PRIMERA' },
        { estado: 'EN_PROCESO', nota: 'SEGUNDA' },
      ];
      const data = { ...reporteBase, estado, historial };
      await seedDoc('reportes_equipos/integridad', data);
      const ref = doc(authDb(UIDS.biomedico), 'reportes_equipos/integridad');
      const nuevaEntrada = { estado: 'EN_PROCESO', nota: 'TERCERA' };
      await assertSucceeds(updateDoc(ref, { ...patch, historial: arrayUnion(nuevaEntrada) }));
      await seedDoc('reportes_equipos/integridad', data);
      await assertFails(updateDoc(ref, { ...patch, historial: cambiar(historial) }));
      assert.deepEqual((await assertSucceeds(getDoc(ref))).data(), data);
    });
  }
}

test('Reporte con historial vacío admite arrayUnion y conserva el orden', async () => {
  await seedDoc('reportes_equipos/vacio', { ...org, estado: 'ABIERTO', historial: [] });
  const ref = doc(authDb(UIDS.biomedico), 'reportes_equipos/vacio');
  const entrada = { fecha: '2026-11-17T10:00:00.000Z', estado: 'EN_PROCESO', nota: 'INICIO' };
  await assertSucceeds(updateDoc(ref, { estado: 'EN_PROCESO', historial: arrayUnion(entrada) }));
  assert.deepEqual((await assertSucceeds(getDoc(ref))).data().historial, [entrada]);
});

test('Reporte legacy con historial no estructurado se puede actualizar sin alterar ese dato', async () => {
  await seedDoc('reportes_equipos/legacy_texto', { ...org, estado: 'ABIERTO', historial: 'HISTORIAL LEGACY' });
  const ref = doc(authDb(UIDS.biomedico), 'reportes_equipos/legacy_texto');
  await assertSucceeds(updateDoc(ref, { estado: 'EN_PROCESO', diagnostico: 'REVISION' }));
  assert.equal((await assertSucceeds(getDoc(ref))).data().historial, 'HISTORIAL LEGACY');
});

test('Rutero acepta el payload real con zona nula y datos de contacto', async () => {
  await seedDoc('pacientes/payload_rutero', { ...org, estado: 'ACTIVO', zona: 'BGA1' });
  await assertSucceeds(updateDoc(doc(authDb(UIDS.visitador), 'pacientes/payload_rutero'), {
    zona: null, direccion: 'CALLE 1', telefono: '5550101', barrio: 'CENTRO',
  }));
});

test('Calibración acepta las estructuras de certificado y costo producidas por la aplicación', async () => {
  await seedDoc('equipos/campos', { ...org, tipoActivo: 'BIOMEDICO' });
  await seedDoc('equipos/campos/calibraciones/payload', { ...org, equipoId: 'campos', fecha: '2026-11-17' });
  const ref = doc(authDb(UIDS.biomedico), 'equipos/campos/calibraciones/payload');
  await assertSucceeds(updateDoc(ref, {
    certificado: { path: 'calibraciones/campos/cert.pdf', name: 'cert.pdf', size: 42, contentType: 'application/pdf', url: 'https://example.invalid/cert' },
    updatedAt: '2026-11-17T10:00:00.000Z',
  }));
  await assertSucceeds(updateDoc(ref, { costo: '123', observaciones: 'CONTROL', updatedAt: '2026-11-17T10:01:00.000Z' }));
});

test('Reportes aceptan los campos reales de inicio, avance y cierre, conservando historial', async () => {
  await seedDoc('reportes_equipos/payload', { ...reporteBase, estado: 'ABIERTO' });
  const ref = doc(authDb(UIDS.biomedico), 'reportes_equipos/payload');
  const base = { fecha: '2026-11-17T10:00:00.000Z', porUid: UIDS.biomedico, porNombre: 'BIOMEDICO' };
  await assertSucceeds(updateDoc(ref, {
    estado: 'EN_PROCESO', diagnostico: 'REVISION', planReparacion: 'REPARAR',
    enProcesoAt: base.fecha, enProcesoPorUid: base.porUid, enProcesoPorNombre: base.porNombre,
    historial: arrayUnion({ ...base, estado: 'EN_PROCESO', nota: 'INICIO' }),
  }));
  await assertSucceeds(updateDoc(ref, { historial: arrayUnion({ ...base, estado: 'EN_PROCESO', nota: 'AVANCE' }) }));
  await assertSucceeds(updateDoc(ref, {
    estado: 'CERRADO', cierreNotas: 'RESUELTO', cerradoAt: base.fecha,
    cerradoPorUid: base.porUid, cerradoPorNombre: base.porNombre,
    historial: arrayUnion({ ...base, estado: 'CERRADO', nota: 'RESUELTO' }),
  }));
  assert.equal((await assertSucceeds(getDoc(ref))).data().historial.length, 4);
});

test('El scope conserva acceso a las ocho sedes autorizadas y rechaza la novena', async () => {
  const scope = Array.from({ length: 9 }, (_, i) => ({ empresaId: 'EMPRESA', sedeId: `SEDE_${i}` }));
  await seedDoc('users/biomedico_ocho', {
    rol: 'INGENIERO_BIOMEDICO', empresaId: 'PRINCIPAL', sedeId: 'PRINCIPAL', scope,
  });
  const db = authDb('biomedico_ocho');
  for (let i = 0; i < scope.length; i++) {
    const path = `equipos/scope_${i}`;
    await seedDoc(path, { ...scope[i], estado: 'DISPONIBLE', nombre: 'EQUIPO' });
    const operation = updateDoc(doc(db, path), { nombre: 'ACTUALIZADO' });
    if (i < 8) await assertSucceeds(operation);
    else await assertFails(operation);
  }
});

test('Perfil legacy sin scope conserva su sede principal y no accede a otra', async () => {
  await seedDoc('users/biomedico_legacy', {
    rol: 'INGENIERO_BIOMEDICO', empresaId: 'MEDICUC', sedeId: 'BUCARAMANGA',
  });
  await seedDoc('equipos/principal_legacy', { ...org, estado: 'DISPONIBLE', nombre: 'EQUIPO' });
  await seedDoc('equipos/ajeno_legacy', { empresaId: 'OTRA', sedeId: 'CENTRO', estado: 'DISPONIBLE', nombre: 'EQUIPO' });
  const db = authDb('biomedico_legacy');
  await assertSucceeds(updateDoc(doc(db, 'equipos/principal_legacy'), { nombre: 'ACTUALIZADO' }));
  await assertFails(updateDoc(doc(db, 'equipos/ajeno_legacy'), { nombre: 'ACTUALIZADO' }));
});

test('Scope de tipo inválido no concede acceso a otra sede', async () => {
  await seedDoc('users/biomedico_scope_invalido', {
    rol: 'INGENIERO_BIOMEDICO', ...org, scope: 'OTRA/CENTRO',
  });
  await seedDoc('equipos/principal_invalido', { ...org, estado: 'DISPONIBLE', nombre: 'EQUIPO' });
  await seedDoc('equipos/ajeno_invalido', { empresaId: 'OTRA', sedeId: 'CENTRO', estado: 'DISPONIBLE', nombre: 'EQUIPO' });
  const db = authDb('biomedico_scope_invalido');
  await assertSucceeds(updateDoc(doc(db, 'equipos/principal_invalido'), { nombre: 'ACTUALIZADO' }));
  await assertFails(updateDoc(doc(db, 'equipos/ajeno_invalido'), { nombre: 'ACTUALIZADO' }));
});

test('Un historial extenso conserva las entradas anteriores al agregar una nueva', async () => {
  const historial = Array.from({ length: 120 }, (_, i) => ({ nota: `ENTRADA ${i}`, estado: 'EN_PROCESO' }));
  await seedDoc('reportes_equipos/largo', { ...org, estado: 'EN_PROCESO', historial });
  const ref = doc(authDb(UIDS.biomedico), 'reportes_equipos/largo');
  await assertSucceeds(updateDoc(ref, { historial: arrayUnion({ nota: 'NUEVA', estado: 'EN_PROCESO' }) }));
  const actualizado = (await assertSucceeds(getDoc(ref))).data().historial;
  assert.deepEqual(actualizado.slice(0, historial.length), historial);
  assert.equal(actualizado.length, historial.length + 1);
});
