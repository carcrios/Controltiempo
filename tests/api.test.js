// Pruebas de extremo a extremo del backend real sobre el simulador. Ejecutar: node tests/api.test.js
const assert = require('assert'), { crear } = require('./simulador');
let ok = 0, mal = 0;
function t(n, f) { try { f(); ok++; } catch (e) { mal++; console.log('✗ ' + n + '\n   ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n   ')); } }
const eq = (a, b, m) => assert.strictEqual(a, b, m);
const X = crear(), { S, api } = X;
const hora = (f, h) => S.ahora(new Date(f + 'T' + h + ':00-05:00').toISOString());
const FOTO = 'data:image/jpeg;base64,' + 'A'.repeat(400), FIRMA = 'data:image/png;base64,' + 'B'.repeat(400);
const GPS = { lat: 4.6500, lng: -74.1000, prec: 10 }, CONS = { datos: true, sensibles: true };
const H = { e: '07:00', s: '16:24', ai: '12:00', af: '13:00' }, LV = { 1: H, 2: H, 3: H, 4: H, 5: H };
let adm, tr, tr2, centro, jefe, codTr, permiso, enlace;
const sinError = (r) => { assert(r.ok, r.e + ': ' + r.m); return r.d; };
const falla = (r, cod) => { assert(!r.ok, 'debía fallar'); eq(r.e, cod, r.m); };

hora('2026-11-09', '06:00');
t('instalar crea hojas, secreto, carpetas, disparadores y código de administrador', () => {
  S.instalar(); assert(X.hojas.Usuarios && X.hojas.Marcaciones && X.props.SECRETO && X.props.CODIGO_ADMIN && X.props.CARPETA_FOTOS);
  eq(sinError(api('publico')).hayAdmin, false);
});
t('registro exige consentimiento de datos', () => falla(api('registro', { cedula: '79000001', codigo: X.props.CODIGO_ADMIN, clave: 'secreta1', nombre: 'Ana Admin', salario: 5000000 }), 'CONSENTIMIENTO'));
t('el primer administrador se crea con el código de un solo uso', () => {
  const cod = X.props.CODIGO_ADMIN, r = sinError(api('registro', { cedula: '79000001', codigo: cod, clave: 'secreta1', nombre: 'Ana Admin', salario: 5000000, consentimiento: CONS }));
  adm = r.token; eq(r.usuario.rol, 'admin'); assert(!X.props.CODIGO_ADMIN);
  falla(api('registro', { cedula: '79000099', codigo: cod, clave: 'secreta1', nombre: 'Intruso', salario: 1, consentimiento: CONS }), 'CODIGO');
});
t('la contraseña no se guarda en claro', () => assert(!JSON.stringify(X.hojas.Usuarios).includes('secreta1')));
t('configuración por empresa sin tocar código', () => {
  const c = sinError(api('adminConfigGuardar', { empresa: { nombre: 'Montajes Andinos S.A.S.', nit: '900.123.456-7' }, correoAlertas: 'rrhh@empresa.co', fotoProbabilidad: 0, alertas: { tardanza: { activo: true, correos: 'jefe.obra@empresa.co' } } }, adm));
  eq(c.empresa.nombre, 'Montajes Andinos S.A.S.'); eq(sinError(api('publico')).empresa.nombre, 'Montajes Andinos S.A.S.');
});
t('centro de trabajo con horario y geocerca; jefe con clave de firma', () => {
  centro = sinError(api('adminCentroGuardar', { nombre: 'Planta Tocancipá', cliente: 'Cervecería', lat: 4.65, lng: -74.1, radio: 150, horario: LV, tol: 5 }, adm));
  eq(centro.horario[1].e, '07:00');
  falla(api('adminJefeGuardar', { nombre: 'Jorge Jefe', cargo: 'Director de obra', whatsapp: '3001234567' }, adm), 'DATOS');
  sinError(api('adminJefeGuardar', { nombre: 'Jorge Jefe', cargo: 'Director de obra', whatsapp: '3001234567', email: 'jorge@empresa.co', pin: '4821' }, adm));
  jefe = sinError(api('adminConfig', {}, adm)).jefes[0]; assert(jefe.tienePin); assert(!JSON.stringify(X.hojas.Jefes).includes('4821'));
});
t('el administrador carga una persona y recibe un código de activación de un solo uso', () => {
  const r = sinError(api('adminPersonaGuardar', { cedula: '1.020.333.444', nombre: 'Pedro Pérez', cargo: 'Soldador', centroId: centro.id, salario: 1750905, ingreso: '2025-11-09' }, adm));
  codTr = r.codigo; assert(/^\d{6}$/.test(codTr)); eq(r.usuario.estado, 'preregistrado');
});
t('ATAQUE: reclamar la identidad de quien aún no tiene contraseña', () => {
  falla(api('registro', { cedula: '1020333444', codigo: '000000', clave: 'robada12', salario: 1, consentimiento: CONS }), 'CODIGO');
  falla(api('registro', { cedula: '1020333444', codigo: '', clave: 'robada12', salario: 1, consentimiento: CONS }), 'CODIGO');
  eq(sinError(api('consultarCedula', { cedula: '1020333444' })).existe, false); // y no revela nombre ni datos
});
t('el trabajador activa su cuenta con cédula + código y crea su contraseña', () => {
  const r = sinError(api('registro', { cedula: '1020333444', codigo: codTr, clave: 'pedro2026', salario: 9999999, consentimiento: CONS, email: 'pedro@correo.co' }));
  tr = r.token; eq(r.usuario.estado, 'activo'); eq(r.usuario.salario, 1750905, 'el salario validado por el admin no lo cambia el trabajador');
  falla(api('registro', { cedula: '1020333444', codigo: codTr, clave: 'otra12345', salario: 1, consentimiento: CONS }), 'EXISTE');
});
t('ingreso con contraseña; contraseña errada se rechaza y se limita', () => {
  falla(api('login', { cedula: '1020333444', clave: 'mala' }), 'CREDENCIALES');
  assert(sinError(api('login', { cedula: '1020333444', clave: 'pedro2026' })).token.length > 40);
});
t('autorregistro con código de empresa queda pendiente hasta que el admin apruebe', () => {
  const cod = sinError(api('adminConfig', {}, adm)).codigoEmpresa;
  const r = sinError(api('registro', { cedula: '52111222', codigo: cod, clave: 'luisa2026', nombre: 'Luisa Gómez', salario: 2500000, consentimiento: CONS, centroId: centro.id }));
  tr2 = r.token; eq(r.usuario.estado, 'pendiente');
  falla(api('marcar', Object.assign({ tipo: 'entrada' }, GPS), tr2), 'PERMISO');
  sinError(api('adminPersonaGuardar', { cedula: '52111222', nombre: 'Luisa Gómez', centroId: centro.id, salario: 2500000, estado: 'activo' }, adm));
});
t('ATAQUE: acciones de administrador sin sesión o con sesión de trabajador', () => {
  falla(api('adminPersonal', {}), 'SESION'); falla(api('adminPersonal', {}, 'x'.repeat(64)), 'SESION');
  falla(api('adminPersonal', {}, tr), 'PERMISO'); falla(api('adminConfigGuardar', { fotoProbabilidad: 0 }, tr), 'PERMISO');
});

/* ---- Marcaciones ---- */
hora('2026-11-09', '06:58');
t('no se puede marcar sin ubicación', () => { falla(api('marcar', { tipo: 'entrada' }, tr), 'GPS_REQUERIDO'); falla(api('marcar', { tipo: 'entrada', lat: 'x', lng: 1 }, tr), 'GPS_REQUERIDO'); });
t('entrada a tiempo usa la hora del servidor, no la del celular', () => {
  const r = sinError(api('marcar', Object.assign({ id: 'm1', tipo: 'entrada', hora: '2026-11-09T05:00' }, GPS), tr));
  eq(r.hora, '2026-11-09T06:58'); eq(r.hoy.siguiente, 'sal_alm'); eq(r.enZona, '1');
});
t('reintento con el mismo id no duplica; segunda entrada se rechaza', () => {
  assert(sinError(api('marcar', Object.assign({ id: 'm1', tipo: 'entrada' }, GPS), tr)).repetida);
  falla(api('marcar', Object.assign({ tipo: 'entrada' }, GPS), tr), 'DUPLICADA');
  eq(X.hojas.Marcaciones.length, 2);
});
hora('2026-11-09', '16:30');
t('olvidó marcar el almuerzo: puede marcar la salida y el día suma 8,4 h', () => {
  const r = sinError(api('marcar', Object.assign({ tipo: 'salida' }, GPS), tr));
  eq(r.resumen.dias[0].min, 510); eq(r.hoy.siguiente, null);
});
hora('2026-11-10', '07:25');
t('llegada tarde genera alerta y correo al destinatario configurado', () => {
  const n = X.correos.length; sinError(api('marcar', Object.assign({ tipo: 'entrada' }, GPS), tr));
  const c = X.correos.slice(n).find(m => m.subject.includes('Llegada tarde')); assert(c); eq(c.to, 'jefe.obra@empresa.co'); assert(c.body.includes('25 min'));
});
t('la salida no puede ser anterior a la entrada', () => falla(api('marcar', Object.assign({ tipo: 'salida', manual: true, hora: '2026-11-10T06:00', motivo: 'prueba de orden' }, GPS), tr), 'ORDEN'));
hora('2026-11-11', '06:50');
t('se le olvidó la salida de ayer: digita la hora, exige motivo y queda para revisión', () => {
  falla(api('marcar', Object.assign({ tipo: 'salida', manual: true, fecha: '2026-11-10', hora: '2026-11-10T18:24' }, GPS), tr), 'DATOS');
  sinError(api('marcar', Object.assign({ tipo: 'salida', manual: true, fecha: '2026-11-10', hora: '2026-11-10T18:24', motivo: 'Se descargó el celular' }, GPS), tr));
  const f = S.leer('Marcaciones').pop(); eq(f.estado, 'revisar'); eq(f.manual, '1');
  assert(S.leer('Alertas').some(a => a.tipo === 'marcacion_manual'));
});
t('no se puede digitar una hora futura ni de hace más de 3 días', () => {
  falla(api('marcar', Object.assign({ tipo: 'entrada', manual: true, hora: '2026-11-11T09:00', motivo: 'hora futura' }, GPS), tr), 'DATOS');
  falla(api('marcar', Object.assign({ tipo: 'entrada', manual: true, fecha: '2026-11-04', hora: '2026-11-04T07:00', motivo: 'muy antiguo' }, GPS), tr), 'DATOS');
});
t('foto aleatoria: si toca foto y no llega, no se registra', () => {
  sinError(api('adminConfigGuardar', { fotoProbabilidad: 100 }, adm));
  falla(api('marcar', Object.assign({ tipo: 'entrada' }, GPS), tr), 'FOTO_REQUERIDA');
  assert(sinError(api('yo', {}, tr)).hoy.fotoPlan.entrada);
  sinError(api('marcar', Object.assign({ tipo: 'entrada', foto: FOTO }, GPS), tr));
  const f = S.leer('Marcaciones').pop(); assert(f.foto && X.archivos[f.foto]);
  assert(sinError(api('adminFoto', { id: f.foto }, adm)).url.startsWith('data:image/jpeg'));
  falla(api('adminFoto', { id: 'SS1' }, adm), 'DATOS');
  sinError(api('adminConfigGuardar', { fotoProbabilidad: 0 }, adm));
});
t('bloquear GPS o cámara genera alerta', () => { sinError(api('bloqueo', { que: 'gps', tipo: 'salida' }, tr)); assert(S.leer('Alertas').some(a => a.tipo === 'bloqueo_permisos')); });
hora('2026-11-11', '16:40');
t('fuera del centro: alerta; con geocerca estricta no deja marcar', () => {
  sinError(api('adminConfigGuardar', { geocercaEstricta: true }, adm));
  falla(api('marcar', { tipo: 'salida', lat: 4.70, lng: -74.05, prec: 10 }, tr), 'FUERA_ZONA');
  sinError(api('adminConfigGuardar', { geocercaEstricta: false }, adm));
  eq(sinError(api('marcar', { tipo: 'salida', lat: 4.70, lng: -74.05, prec: 10 }, tr)).enZona, '0');
  assert(S.leer('Alertas').some(a => a.tipo === 'fuera_zona'));
});

/* ---- Horas extra ---- */
t('las 2 h extra del día 10 quedan pendientes y no se pagan hasta aprobarlas', () => {
  const ex = sinError(api('adminExtras', { estado: 'pendiente' }, adm)); const x = ex.find(e => e.fecha === '2026-11-10'); assert(x); eq(x.minCalc, 95); // entró 07:25, salió 18:24, jornada 8,4 h
  const fila = sinError(api('adminNominaPrevia', { desde: '2026-11-01', hasta: '2026-11-15' }, adm)).filas.find(f => f.cedula === '1020333444');
  eq(fila.liq.horas.extras, 0); assert(fila.liq.horas.extrasSinAprobar > 1.5);
  falla(api('adminExtraDecidir', { id: x.id, decision: 'aprobar', min: 500 }, adm), 'DATOS');
  sinError(api('adminExtraDecidir', { id: x.id, decision: 'aprobar', min: 95 }, adm));
  const f2 = sinError(api('adminNominaPrevia', { desde: '2026-11-01', hasta: '2026-11-15' }, adm)).filas.find(f => f.cedula === '1020333444');
  eq(f2.liq.horas.extras, 1.6); assert(f2.liq.conceptos.find(c => c.cod === 'HED'));
});
t('editar un día recalcula la semana y devuelve las extras a pendiente', () => {
  sinError(api('adminMarcacionGuardar', { cedula: '1020333444', fecha: '2026-11-10', tipo: 'salida', hora: '19:24', motivo: 'Corrección según planilla' }, adm));
  const x = sinError(api('adminExtras', {}, adm)).find(e => e.fecha === '2026-11-10'); eq(x.estado, 'pendiente'); eq(x.minCalc, 155);
  assert(S.leer('Auditoria').some(a => a.accion === 'marcacion_ajustada'));
});
t('aprobar por encima del tope legal de 2 h exige confirmación expresa', () => {
  const x = sinError(api('adminExtras', {}, adm)).find(e => e.fecha === '2026-11-10'); assert(x.superaDia);
  falla(api('adminExtraDecidir', { id: x.id, decision: 'aprobar', min: 155 }, adm), 'TOPE');
  sinError(api('adminExtraDecidir', { id: x.id, decision: 'aprobar', min: 120 }, adm));
});
t('cambiar el horario de la obra no altera los días ya trabajados', () => {
  const antes = sinError(api('adminMarcaciones', { desde: '2026-11-09', hasta: '2026-11-09' }, adm))[0].min;
  sinError(api('adminCentroGuardar', Object.assign({}, centro, { horario: { 1: { e: '06:00', s: '14:00' }, 2: H, 3: H, 4: H, 5: H } }), adm));
  const d = sinError(api('adminMarcaciones', { desde: '2026-11-09', hasta: '2026-11-09' }, adm))[0]; eq(d.min, antes); eq(d.tarde, 0);
  sinError(api('adminCentroGuardar', Object.assign({}, centro, { horario: LV }), adm));
});

/* ---- Permisos ---- */
hora('2026-11-12', '08:00');
t('solicitud de permiso: queda en firmas, con enlace para WhatsApp y correo al jefe', () => {
  falla(api('permisoCrear', { tipo: 'cita_medica', fechaSalida: '2026-11-13', fechaRegreso: '2026-11-13', motivo: 'Cita de control' }, tr), 'DATOS');
  permiso = sinError(api('permisoCrear', { tipo: 'cita_medica', fechaSalida: '2026-11-13', horaSalida: '09:00', fechaRegreso: '2026-11-13', horaRegreso: '12:00', motivo: 'Cita de control en la EPS' }, tr));
  eq(permiso.estado, 'en_firmas'); enlace = permiso.firmas[0].enlace; assert(enlace.includes('#/firma/')); eq(permiso.firmas[0].whatsapp, '3001234567');
  assert(X.correos.some(m => m.to === 'jorge@empresa.co' && m.subject.includes('Permiso por firmar')));
});
const partes = () => { const [p, j, k] = enlace.split('#/firma/')[1].split('.'); return { p, j, k }; };
t('ATAQUE: fabricar la firma del jefe sin su clave, con enlace alterado o sin sesión', () => {
  falla(api('firmaResponder', Object.assign(partes(), { decision: 'aprobar', firma: FIRMA, pin: '0000' })), 'CREDENCIALES'); // el trabajador tiene el enlace, pero no la clave
  falla(api('firmaResponder', Object.assign(partes(), { k: 'a'.repeat(28), decision: 'aprobar', firma: FIRMA, pin: '4821' })), 'ENLACE');
  falla(api('adminPermisoDecidir', { id: permiso.id, decision: 'aprobar', obs: 'me lo apruebo' }, tr), 'PERMISO');
  eq(S.leer('Permisos')[0].estado, 'en_firmas');
});
t('ATAQUE: adivinar la clave de firma por fuerza bruta se bloquea', () => {
  let r; for (let i = 0; i < 8; i++) r = api('firmaResponder', Object.assign(partes(), { decision: 'aprobar', firma: FIRMA, pin: '1' + i + '00' }));
  eq(r.e, 'DEMASIADOS'); Object.keys(X.cache).forEach(k => { if (k.startsWith('rl:')) delete X.cache[k]; });
});
t('el jefe ve el permiso y firma con su clave: queda firmado, aún NO aprobado', () => {
  eq(sinError(api('firmaVer', partes())).nombre, 'Pedro Pérez');
  falla(api('firmaResponder', Object.assign(partes(), { decision: 'aprobar', pin: '4821' })), 'DATOS'); // sin firma dibujada
  eq(sinError(api('firmaResponder', Object.assign(partes(), { decision: 'aprobar', firma: FIRMA, pin: '4821' }))).estado, 'firmado');
  falla(api('firmaResponder', Object.assign(partes(), { decision: 'aprobar', firma: FIRMA, pin: '4821' })), 'DATOS');
  assert(X.correos.some(m => m.subject.includes('Constancia de tu respuesta')));
});
t('solo la aprobación del administrador en pantalla lo lleva a la nómina', () => {
  eq(sinError(api('adminTablero', {}, adm)).pendientes.permisos, 1);
  eq(sinError(api('adminPermisoDecidir', { id: permiso.id, decision: 'aprobar' }, adm)).estado, 'aprobado');
  eq(sinError(api('permisosMios', {}, tr))[0].estado, 'aprobado');
});
t('calamidad doméstica rechazada por el jefe exige motivo y queda rechazada', () => {
  const p = sinError(api('permisoCrear', { tipo: 'calamidad', fechaSalida: '2026-11-12', horaSalida: '10:00', fechaRegreso: '2026-11-12', horaRegreso: '14:00', motivo: 'Inundación en la vivienda' }, tr));
  const [pp, j, k] = p.firmas[0].enlace.split('#/firma/')[1].split('.');
  falla(api('firmaResponder', { p: pp, j, k, decision: 'rechazar', pin: '4821' }), 'DATOS');
  eq(sinError(api('firmaResponder', { p: pp, j, k, decision: 'rechazar', pin: '4821', obs: 'Falta el soporte' })).estado, 'rechazado');
});
t('permiso sin respuesta vence al cumplirse el límite configurado', () => {
  sinError(api('adminConfigGuardar', { horasLimitePermiso: 2 }, adm));
  const p = sinError(api('permisoCrear', { tipo: 'personal', fechaSalida: '2026-11-20', horaSalida: '14:00', fechaRegreso: '2026-11-20', horaRegreso: '16:00', motivo: 'Diligencia bancaria' }, tr));
  hora('2026-11-12', '10:30'); S.tareaCada5();
  eq(sinError(api('permisosMios', {}, tr)).find(x => x.id === p.id).estado, 'vencido'); assert(S.leer('Alertas').some(a => a.tipo === 'permiso_vencido'));
});
t('vacaciones: saldo causado según fecha de ingreso', () => eq(sinError(api('yo', {}, tr)).vacaciones.causadas, 15.1));

/* ---- Incapacidades, ausencias, tablero ---- */
t('incapacidad registrada por el administrador (sin diagnóstico)', () => {
  sinError(api('adminIncapacidadGuardar', { cedula: '52111222', tipo: 'general', desde: '2026-11-12', hasta: '2026-11-13', entidad: 'EPS Sura' }, adm));
  eq(sinError(api('adminIncapacidades', {}, adm))[0].dias, 2); assert(!('diagnostico' in S.leer('Incapacidades')[0]));
});
t('quien no se presenta genera alerta de ausencia una sola vez; con incapacidad no', () => {
  hora('2026-11-12', '08:15'); S.tareaCada15(); S.tareaCada15();
  const a = S.leer('Alertas').filter(x => x.tipo === 'ausencia'); eq(a.length, 1); eq(a[0].cedula, '1020333444');
});
t('tablero del administrador resume el día', () => {
  const tb = sinError(api('adminTablero', {}, adm)); eq(tb.cuenta.incapacidad, 1); eq(tb.cuenta.ausente, 1); assert(tb.personas.length >= 3);
});
t('resumen del trabajador: horas, neto estimado y proyección', () => {
  const r = sinError(api('yo', {}, tr)).resumen; assert(r.neto > 0 && r.proyeccion >= r.neto && r.horas.trabajadas > 20); eq(r.periodo.desde, '2026-11-01');
});

/* ---- Nómina y cierre ---- */
t('no se puede cerrar un periodo que no ha terminado', () => falla(api('adminNominaCerrar', { desde: '2026-11-01', hasta: '2026-11-15' }, adm), 'DATOS'));
hora('2026-11-17', '09:00');
t('cerrar la quincena genera desprendibles y congela el periodo', () => {
  const r = sinError(api('adminNominaCerrar', { desde: '2026-11-01', hasta: '2026-11-15' }, adm)); assert(r.personas >= 2);
  const d = sinError(api('desprendibles', {}, tr)); eq(d.length, 1); eq(d[0].detalle.persona.nombre, 'Pedro Pérez'); assert(d[0].neto > 0);
  falla(api('adminNominaCerrar', { desde: '2026-11-01', hasta: '2026-11-15' }, adm), 'CERRADO');
  falla(api('adminMarcacionGuardar', { cedula: '1020333444', fecha: '2026-11-10', tipo: 'salida', hora: '23:00', motivo: 'cambio tardío' }, adm), 'CERRADO');
  falla(api('marcar', Object.assign({ tipo: 'sal_alm', manual: true, fecha: '2026-11-13', hora: '2026-11-13T12:00', motivo: 'corrección tardía' }, GPS), tr), 'CERRADO');
});
t('un trabajador solo ve sus propios desprendibles', () => eq(sinError(api('desprendibles', {}, tr2)).every(d => d.detalle.persona.cedula === '52111222'), true));
t('resumen por obra y exportación completa para Excel', () => {
  const o = sinError(api('adminResumenObra', { desde: '2026-11-01', hasta: '2026-11-15' }, adm)).obras.find(x => x.centro === 'Planta Tocancipá'); assert(o.horas > 20 && o.personas >= 2);
  const x = sinError(api('adminExportar', { desde: '2026-11-01', hasta: '2026-11-15' }, adm));
  ['Personal', 'Jornadas', 'Horas extra', 'Permisos', 'Incapacidades', 'Nómina estimada', 'Resumen por obra'].forEach(h => assert(Array.isArray(x[h]) && x[h].length, h));
});

/* ---- Seguridad, retención, respaldo, monitoreo ---- */
t('dar de baja revoca la sesión de inmediato', () => {
  sinError(api('adminPersonaGuardar', { cedula: '52111222', nombre: 'Luisa Gómez', centroId: centro.id, salario: 2500000, estado: 'inactivo' }, adm));
  falla(api('yo', {}, tr2), 'SESION'); falla(api('login', { cedula: '52111222', clave: 'luisa2026' }), 'PERMISO');
});
t('el administrador no puede desactivarse ni quitarse el rol', () => falla(api('adminPersonaGuardar', { cedula: '79000001', nombre: 'Ana Admin', salario: 5000000, rol: 'trabajador' }, adm), 'DATOS'));
t('retención automática: borra fotos antiguas sin que nadie abra el panel', () => {
  const f = S.leer('Marcaciones').find(m => m.foto); assert(X.archivos[f.foto]);
  hora('2026-12-20', '02:00'); S.limpiar(); S.limpiarDatos_(); S.limpiar();
  assert(!X.archivos[f.foto]); eq(S.leer('Marcaciones').filter(m => m.foto).length, 0); assert(S.leer('Marcaciones')[0].lat !== '');
});
t('copia de seguridad: crea la copia, conserva las últimas N y avisa', () => {
  sinError(api('adminConfigGuardar', { respaldoConservar: 2 }, adm));
  for (let i = 0; i < 4; i++) sinError(api('adminRespaldar', {}, adm));
  eq(Object.values(X.archivos).filter(a => a.carpeta === X.props.CARPETA_RESPALDOS).length, 2); assert(X.props.ULTIMO_RESPALDO);
});
t('monitoreo: errores del cliente quedan registrados y el panel de salud responde', () => {
  sinError(api('error', { mensaje: 'TypeError: x is undefined', detalle: 'en Inicio.jsx', version: '1.0.0' }));
  const s = sinError(api('adminSalud', {}, adm)); eq(s.errores7d, 1); assert(s.pruebas.every(p => p.ok), JSON.stringify(s.pruebas)); eq(s.disparadores.length, 3);
  assert(sinError(api('adminBitacoras', { cual: 'auditoria' }, adm)).length > 10);
});
t('una acción desconocida o un cuerpo inválido no rompe el servicio', () => {
  falla(api('noExiste', {}), 'ACCION');
  eq(JSON.parse(S.doPost({ postData: { contents: '{mal json' } }).texto).e, 'ERROR');
});
t('cerrar sesión invalida el token', () => { sinError(api('salir', {}, tr)); falla(api('yo', {}, tr), 'SESION'); });
console.log(`API: ${ok} pruebas correctas, ${mal} con error`); process.exit(mal ? 1 : 0);
