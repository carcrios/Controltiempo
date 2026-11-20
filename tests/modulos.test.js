// Pruebas de los módulos avanzados (v1.6–1.7). Ejecutar: node tests/modulos.test.js
const assert = require('assert'), { crear } = require('./simulador'), crypto = require('crypto');
let ok = 0, mal = 0;
function t(n, f) { try { f(); ok++; } catch (e) { mal++; console.log('✗ ' + n + '\n   ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n   ')); } }
const eq = (a, b, m) => assert.strictEqual(a, b, m);
const sinError = (r) => { assert(r.ok, r.e + ': ' + r.m); return r.d; };
const falla = (r, cod) => { assert(!r.ok, 'debía fallar'); eq(r.e, cod, r.m); };
const CONS = { datos: true, sensibles: true }, GPS = { lat: 4.65, lng: -74.1, prec: 10 }, FOTO = 'data:image/jpeg;base64,' + 'A'.repeat(400);
const H = { e: '07:00', s: '16:24', ai: '12:00', af: '13:00' }, LV = { 1: H, 2: H, 3: H, 4: H, 5: H };

function empresa(opciones) {
  const X = crear(opciones), { S, api } = X, hora = (f, h) => S.ahora(new Date(f + 'T' + h + ':00-05:00').toISOString());
  hora('2026-09-01', '06:00'); S.instalar();
  const adm = sinError(api('registro', { cedula: '79000001', codigo: X.props.CODIGO_ADMIN, clave: 'secreta1', nombre: 'Ana Admin', salario: 5000000, consentimiento: CONS, email: 'ana@empresa.co' })).token;
  sinError(api('adminConfigGuardar', { fotoProbabilidad: 0, fotoEnAnomalia: false, urlApp: 'https://app.ejemplo.co/' }, adm));
  const c1 = sinError(api('adminCentroGuardar', { nombre: 'Planta', lat: 4.65, lng: -74.1, radio: 150, horario: LV, tol: 5 }, adm));
  const c2 = sinError(api('adminCentroGuardar', { nombre: 'Bodega', lat: 4.71, lng: -74.2, radio: 150, horario: LV, tol: 5 }, adm));
  const tk = {};
  [['1020333444', 'Pedro Pérez', c1.id, 'trabajador'], ['52111222', 'Luisa Gómez', c2.id, 'trabajador'], ['80111000', 'Sara Sup', c1.id, 'supervisor']].forEach(([ced, nombre, centroId, rol]) => {
    const r = sinError(api('adminPersonaGuardar', { cedula: ced, nombre, centroId, rol, supCentros: rol === 'supervisor' ? [centroId] : [], salario: 1750905, ingreso: '2025-03-10', email: ced + '@correo.co' }, adm));
    tk[ced] = sinError(api('registro', { cedula: ced, codigo: r.codigo, clave: 'clave2026', consentimiento: CONS })).token;
  });
  return { X, S, api, hora, adm, tk, c1, c2 };
}
const E = empresa();
const { S, api, hora, adm, tk, c1 } = E, P = '1020333444';
function semana(f0, salida) { ['01', '02', '03', '04', '05'].forEach((d) => { const f = f0 + d; hora(f, '06:58'); sinError(api('marcar', { tipo: 'entrada', ...GPS }, tk[P])); hora(f, salida); sinError(api('marcar', { tipo: 'salida', ...GPS }, tk[P])); }); }

t('préstamo: la cuota se descuenta al cerrar la nómina y aparece en el desprendible', () => {
  falla(api('adminPrestamoGuardar', { cedula: P, concepto: 'Adelanto', monto: 300000, cuotas: 3 }, adm), 'DATOS'); // sin autorización firmada no se crea
  sinError(api('adminPersonaGuardar', { cedula: P, nombre: 'Pedro Pérez', centroId: c1.id, rol: 'trabajador', salario: 3000000, ingreso: '2025-03-10', email: P + '@correo.co' }, adm)); // con el mínimo no se puede descontar (mínimo vital)
  sinError(api('adminPrestamoGuardar', { cedula: P, concepto: 'Adelanto', monto: 300000, cuotas: 3, autorizacion: FOTO }, adm));
  falla(api('adminPrestamoAplicarCuota', { id: sinError(api('adminPrestamos', {}, adm))[0].id }, adm), 'DATOS'); // no hay descuento manual
  semana('2026-09-', '16:24');
  hora('2026-09-17', '08:00'); sinError(api('adminNominaCerrar', { desde: '2026-09-01', hasta: '2026-09-15' }, adm));
  const p = sinError(api('adminPrestamos', {}, adm))[0]; eq(p.saldo, 200000); eq(p.pagadas, 1);
  eq(S.leer('Novedades').filter((n) => n.cedula === P && n.concepto.startsWith('Cuota')).length, 1, 'una sola cuota por periodo');
  const d = sinError(api('desprendibles', {}, tk[P]))[0]; assert(d.detalle.deduccionesDet.some((x) => x.cod === 'DES' && x.valor === 100000), 'cuota en el desprendible');
  sinError(api('confirmarDesprendible', { id: d.id }, tk[P])); assert(sinError(api('desprendibles', {}, tk[P]))[0].acuse.startsWith('2026'));
});
t('compensatorios: las extras se abonan con su recargo, sin duplicar, y el saldo no queda negativo', () => {
  hora('2026-09-21', '06:58'); sinError(api('marcar', { tipo: 'entrada', ...GPS }, tk[P])); hora('2026-09-21', '18:24'); sinError(api('marcar', { tipo: 'salida', ...GPS }, tk[P]));
  const x = sinError(api('adminExtras', { estado: 'pendiente' }, adm)).find((e) => e.fecha === '2026-09-21');
  falla(api('adminExtraDecidir', { id: x.id, decision: 'aprobar', min: 120, aCompensatorio: true, obs: 'Acuerdo firmado 21-sep' }, adm), 'DATOS'); // apagado por defecto
  sinError(api('adminConfigGuardar', { compensarExtras: true }, adm));
  falla(api('adminExtraDecidir', { id: x.id, decision: 'aprobar', min: 120, aCompensatorio: true }, adm), 'DATOS'); // sin el acuerdo escrito
  sinError(api('adminExtraDecidir', { id: x.id, decision: 'aprobar', min: 120, aCompensatorio: true, obs: 'Acuerdo firmado 21-sep', soporte: FOTO }, adm));
  eq(sinError(api('misCompensatorios', {}, tk[P])).saldoMin, 150, '2 h extra diurnas = 2,5 h de descanso (25 %)');
  sinError(api('adminExtraDecidir', { id: x.id, decision: 'aprobar', min: 120, aCompensatorio: true, obs: 'Acuerdo firmado 21-sep', soporte: FOTO }, adm));
  eq(sinError(api('misCompensatorios', {}, tk[P])).saldoMin, 150, 'decidir otra vez no duplica');
  falla(api('adminCompensatorioGuardar', { cedula: P, minutos: -480, fecha: '2026-09-25' }, adm), 'DATOS');
  sinError(api('adminCompensatorioGuardar', { cedula: P, minutos: -150, fecha: '2026-09-25' }, adm)); // los disfrutó
  falla(api('adminExtraDecidir', { id: x.id, decision: 'aprobar', min: 120, obs: 'mejor en dinero' }, adm), 'DATOS'); // ya no se puede quitar el abono
});
t('comunicados: llegan según el centro y registran la lectura', () => {
  sinError(api('adminComunicadoCrear', { titulo: 'Simulacro', cuerpo: 'Jueves 10 a. m.', centros: [c1.id] }, adm));
  const m = sinError(api('comunicadosMios', {}, tk[P])); eq(m.length, 1); eq(sinError(api('comunicadosMios', {}, tk['52111222'])).length, 0);
  sinError(api('comunicadoLeer', { id: m[0].id }, tk[P])); eq(sinError(api('adminComunicados', {}, adm))[0].totalLeidos, 1);
});
t('certificado laboral verificable por cualquiera con cédula, fecha y código', () => {
  const c = sinError(api('certificadoLaboral', { conSalario: true }, tk[P])); eq(c.empleado.salario, 3000000); assert(c.verificarEn.endsWith('#/verificar'));
  const v = sinError(api('certificadoVerificar', { cedula: P, fecha: c.fecha, codigo: c.codigoVerificacion })); eq(v.valido, true); eq(v.salario, 3000000, 'la verificación muestra el salario certificado');
  eq(sinError(api('certificadoVerificar', { cedula: P, fecha: c.fecha, codigo: 'ABCDEFGHIJ' })).valido, false);
  for (let i = 0; i < 12; i++) api('certificadoVerificar', { cedula: '11111111', fecha: c.fecha, codigo: 'ABCDEFGHIJ' }); // alguien satura con otra cédula…
  eq(sinError(api('certificadoVerificar', { cedula: P, fecha: c.fecha, codigo: c.codigoVerificacion })).valido, true, '…y la verificación legítima sigue funcionando');
});
t('kiosco: sesión propia que solo marca en su centro; no sirve para adivinar claves ni para entrar al panel', () => {
  hora('2026-09-22', '06:50'); const sup = sinError(api('login', { cedula: '80111000', clave: 'clave2026' })).token;
  falla(api('kioscoIniciar', { centroId: E.c2.id }, sup), 'PERMISO'); // centro que no es suyo
  const k = sinError(api('kioscoIniciar', { centroId: c1.id }, sup)).token;
  eq(sinError(api('yo', {}, k)).kiosco.centroId, c1.id);
  falla(api('adminExtras', { estado: 'pendiente' }, k), 'PERMISO'); falla(api('adminExtraDecidir', { id: 'x', decision: 'aprobar', min: 10 }, k), 'PERMISO'); falla(api('marcar', { tipo: 'entrada', ...GPS }, k), 'PERMISO');
  falla(api('kioscoMarcar', { cedula: P, clave: 'clave2026', tipo: 'entrada', ...GPS }, sup), 'PERMISO'); // sin activar el kiosco no se usa
  hora('2026-09-22', '06:55'); const r = sinError(api('kioscoMarcar', { cedula: P, clave: 'clave2026', tipo: 'entrada', ...GPS }, k)); eq(r.usuario, 'Pedro');
  falla(api('kioscoMarcar', { cedula: P, clave: 'mala', tipo: 'salida', ...GPS }, k), 'CREDENCIALES');
  falla(api('kioscoMarcar', { cedula: '52111222', clave: 'clave2026', tipo: 'entrada', ...GPS }, k), 'CREDENCIALES'); // otra obra: mismo error que clave mala
  falla(api('kioscoMarcar', { cedula: '79000001', clave: 'secreta1', tipo: 'entrada', ...GPS }, k), 'CREDENCIALES'); // nunca administradores
  falla(api('kioscoMarcar', { cedula: '79000001', clave: 'otra', tipo: 'entrada', ...GPS }, k), 'CREDENCIALES');
  falla(api('kioscoMarcar', { cedula: P, clave: 'clave2026', tipo: 'salida', ...GPS }, tk[P]), 'PERMISO');
  sinError(api('adminCentroGuardar', { ...c1, exigirQr: true }, adm)); hora('2026-09-22', '16:30');
  sinError(api('kioscoMarcar', { cedula: P, clave: 'clave2026', tipo: 'salida', ...GPS }, k)); // la tablet está en la obra: no pide QR
  sinError(api('adminCentroGuardar', { ...c1, exigirQr: false }, adm));
});
t('QR de obra: sin el código vigente no se marca; con el del minuto o el del día sí', () => {
  sinError(api('adminCentroGuardar', { ...c1, exigirQr: true }, adm));
  hora('2026-09-23', '06:55'); falla(api('marcar', { tipo: 'entrada', ...GPS }, tk[P]), 'QR_REQUERIDO');
  const q = sinError(api('adminQrCentro', { centroId: c1.id }, tk['80111000']));
  sinError(api('marcar', { tipo: 'entrada', ...GPS, qrCodigo: q.qrPayload }, tk[P]));
  const dia = sinError(api('adminQrCentro', { centroId: c1.id }, adm)).codigoDia;
  hora('2026-09-23', '12:00'); falla(api('marcar', { tipo: 'sal_alm', lat: 4.80, lng: -74.3, prec: 10, qrCodigo: dia }, tk[P]), 'QR_REQUERIDO'); // código del día fuera de la obra
  falla(api('marcar', { tipo: 'sal_alm', ...GPS, manual: true, hora: '2026-09-23T11:58', motivo: 'se me olvidó' }, tk[P]), 'QR_REQUERIDO'); // "olvido" de hace 2 min
  hora('2026-09-23', '16:30'); sinError(api('marcar', { tipo: 'salida', ...GPS, qrCodigo: dia }, tk[P]));
  sinError(api('adminCentroGuardar', { ...c1, exigirQr: false }, adm));
});
t('GPS: desplazamiento imposible queda en revisión con alerta; señal muy imprecisa se rechaza', () => {
  hora('2026-09-24', '06:55'); sinError(api('marcar', { tipo: 'entrada', ...GPS }, tk[P]));
  hora('2026-09-24', '07:05'); sinError(api('marcar', { tipo: 'sal_alm', lat: 6.25, lng: -75.56, prec: 10 }, tk[P]));
  assert(S.leer('Alertas').some((a) => a.tipo === 'gps_sospechoso'));
  falla(api('marcar', { tipo: 'ent_alm', lat: 4.65, lng: -74.1, prec: 500 }, tk[P]), 'GPS_IMPRECISO');
});
t('dos marcaciones seguidas en el mismo minuto se aceptan', () => {
  hora('2026-09-24', '12:00'); sinError(api('marcar', { tipo: 'ent_alm', ...GPS }, tk[P])); sinError(api('marcar', { tipo: 'salida', ...GPS }, tk[P]));
});
t('celular vinculado: otro equipo no entra hasta que el administrador lo libere', () => {
  sinError(api('adminConfigGuardar', { vincularDispositivo: true }, adm));
  sinError(api('login', { cedula: '52111222', clave: 'clave2026', dispositivoId: 'CEL-A' }));
  falla(api('login', { cedula: '52111222', clave: 'clave2026', dispositivoId: 'CEL-B' }), 'DISPOSITIVO');
  falla(api('login', { cedula: '52111222', clave: 'clave2026' }), 'DISPOSITIVO'); // sin identificador tampoco entra
  sinError(api('adminLiberarDispositivo', { cedula: '52111222' }, adm)); sinError(api('login', { cedula: '52111222', clave: 'clave2026', dispositivoId: 'CEL-B' }));
  sinError(api('adminConfigGuardar', { vincularDispositivo: false }, adm));
});
t('verificación en dos pasos del administrador por correo', () => {
  const r2 = sinError(api('adminPersonaGuardar', { cedula: '79000002', nombre: 'Beto Admin', rol: 'admin', salario: 3000000 }, adm));
  sinError(api('registro', { cedula: '79000002', codigo: r2.codigo, clave: 'beto2026x', consentimiento: CONS }));
  falla(api('adminConfigGuardar', { admin2FA: true }, adm), 'DATOS'); // hay un administrador sin correo
  sinError(api('adminPersonaGuardar', { cedula: '79000002', nombre: 'Beto Admin', rol: 'admin', salario: 3000000, email: 'beto@empresa.co' }, adm));
  sinError(api('adminConfigGuardar', { admin2FA: true }, adm));
  const n = E.X.correos.length; falla(api('login', { cedula: '79000001', clave: 'secreta1' }), '2FA_REQUERIDO');
  const cod = /es: (\d{6})/.exec(E.X.correos.slice(n).pop().body)[1];
  falla(api('login', { cedula: '79000001', clave: 'secreta1', codigo2fa: '000000' }), 'CREDENCIALES');
  sinError(api('login', { cedula: '79000001', clave: 'secreta1', codigo2fa: cod }));
  sinError(api('recuperarPedir', { cedula: '79000002' })); const rc = /(\d{6})/.exec(E.X.correos.slice(-1)[0].body)[1];
  assert(!sinError(api('recuperarCambiar', { cedula: '79000002', codigo: rc, clave: 'beto2027x' })).token, 'recuperar no salta el código');
  falla(api('login', { cedula: '79000002', clave: 'beto2027x' }), '2FA_REQUERIDO');
  const cod2 = /es: (\d{6})/.exec(E.X.correos.slice(-1)[0].body)[1]; sinError(api('login', { cedula: '79000002', clave: 'beto2027x', codigo2fa: cod2 }));
  sinError(api('adminConfigGuardar', { admin2FA: false }, adm));
});
t('liquidación de contrato: usa el promedio cuando hay salario variable y no descuenta préstamos sin autorización', () => {
  const l = sinError(api('adminLiquidacionContrato', { cedula: P, fechaRetiro: '2026-09-30' }, adm));
  assert(l.basePrestaciones >= l.salario + l.auxTransporte, 'base al menos salario + auxilio'); eq(l.saldoPrestamos, 200000); eq(l.descuentoPrestamos, 0);
  eq(l.diasAnio, 270, 'meses de 30 días'); eq(l.diasSemestre, 90); eq(l.cesantias, Math.round(l.baseCesantias * 270 / 360)); eq(l.indemnizacion, 0);
  const l2 = sinError(api('adminLiquidacionContrato', { cedula: P, fechaRetiro: '2026-09-30', autorizaDescuento: true }, adm)); eq(l2.totalEstimado, l.totalEstimado - 200000);
  const l3 = sinError(api('adminLiquidacionContrato', { cedula: P, fechaRetiro: '2026-09-30', causa: 'sin_justa_causa' }, adm));
  const dIndem = 30 + 20 * (l3.diasServicio / 360 - 1); assert(Math.abs(l3.indemnizacion - Math.round(l3.salario / 30 * dIndem)) <= 1, 'art. 64: 30 días el primer año y 20 por año adicional');
  const r = sinError(api('adminLiquidacionContrato', { cedula: P, fechaRetiro: '2026-12-31' }, adm)); eq(r.diasAnio, 360);
});
t('provisiones de prestaciones: prima y cesantías al 8,33 % del devengado', () => {
  const p = sinError(api('adminProvisiones', { desde: '2026-09-16', hasta: '2026-09-30' }, adm)), f = p.filas.find((x) => x.cedula === P);
  eq(f.prima, Math.round(f.devengado / 12)); eq(f.intereses, Math.round(f.cesantias * 0.12));
  assert(f.aportesDet.pension > 0 && f.aportesDet.caja > 0 && f.aportesDet.arl > 0 && f.aportesDet.salud > 0, 'aportes del empleador (sin exoneración por defecto)');
  eq(f.costoTotal, f.devengado + f.totalProvisiones + f.aportes);
});
t('traslado masivo, edición de incapacidad y supresión de datos de un exempleado', () => {
  eq(sinError(api('adminTrasladoMasivo', { centroId: E.c2.id, cedulas: [P] }, adm)).movidos, 1);
  sinError(api('adminIncapacidadGuardar', { cedula: '52111222', tipo: 'general', desde: '2026-09-25', hasta: '2026-09-26' }, adm));
  const i = sinError(api('adminIncapacidades', {}, adm))[0]; sinError(api('adminIncapacidadEditar', { id: i.id, hasta: '2026-09-29' }, adm)); eq(sinError(api('adminIncapacidades', {}, adm))[0].hasta, '2026-09-29');
  falla(api('adminAnonimizarUsuario', { cedula: '52111222' }, adm), 'DATOS');
  sinError(api('adminPersonaGuardar', { cedula: '52111222', nombre: 'Luisa Gómez', salario: 1750905, estado: 'inactivo' }, adm));
  const cert = sinError(api('adminCertificadoLaboral', { cedula: '52111222', conSalario: true }, adm)); eq(cert.empleado.estado, 'retirado'); // RRHH certifica a retirados
  sinError(api('adminIncapacidadEditar', { id: i.id, nota: 'gastritis crónica' }, adm));
  const sup = sinError(api('adminAnonimizarUsuario', { cedula: '52111222' }, adm)); assert(sinError(api('adminPersonal', {}, adm)).find((u) => u.cedula === '52111222').nombre.startsWith('Exempleado'));
  assert(sup.conservado.includes('CST'));
  assert(!S.leer('Incapacidades').some((x) => x.cedula === '52111222' && x.nota), 'sin datos de salud');
  assert(!S.leer('Marcaciones').some((m) => m.cedula === '52111222' && (m.lat || m.foto)), 'sin GPS ni fotos');
  eq(sinError(api('certificadoVerificar', { cedula: '52111222', fecha: cert.fecha, codigo: cert.codigoVerificacion })).valido, false, 'el certificado ya no se verifica');
});
t('vista en vivo, expediente y tablero 360°', () => {
  hora('2026-09-28', '08:00'); sinError(api('marcar', { tipo: 'entrada', ...GPS, lat: 4.71, lng: -74.2 }, tk[P]));
  eq(sinError(api('adminEnVivo', {}, adm)).resumen.en_obra, 1);
  const x = sinError(api('adminExpediente360', { cedula: P }, adm)); eq(x.usuario.cedula, P); assert(x.prestamos.length === 1);
  sinError(api('adminPersonaGuardar', { cedula: '80111000', nombre: 'Sara Sup', rol: 'supervisor', supCentros: [E.c2.id], centroId: c1.id, salario: 1750905 }, adm));
  const xs = sinError(api('adminExpediente360', { cedula: P }, tk['80111000'])); assert(xs.usuario.salario === undefined && xs.usuario.cuenta === undefined && !xs.prestamos.length, 'el supervisor no ve salario, cuenta ni préstamos');
  assert(sinError(api('adminTablero360', {}, adm)).alertasOperativas);
});
t('auditoría encadenada: detecta una fila alterada a mano', () => {
  eq(sinError(api('adminVerificarAuditoria', {}, adm)).integra, true);
  const h = E.X.hojas.Auditoria, copia = h.map((r) => r.slice()); h[3][3] = 'alterado'; S.limpiar(); eq(sinError(api('adminVerificarAuditoria', {}, adm)).integra, false);
  h.forEach((r, i) => { if (i >= 3) r[4] = ''; }); S.limpiar(); eq(sinError(api('adminVerificarAuditoria', {}, adm)).integra, false, 'borrar las firmas también se detecta');
  h.length = 0; copia.forEach((r) => h.push(r)); h.splice(-3, 3); S.limpiar(); eq(sinError(api('adminVerificarAuditoria', {}, adm)).integra, false, 'borrar las últimas filas también se detecta');
  h.length = 0; copia.forEach((r) => h.push(r)); S.limpiar(); eq(sinError(api('adminVerificarAuditoria', {}, adm)).integra, true);
});
t('Telegram: las alertas salen también por Telegram cuando está configurado', () => {
  sinError(api('adminConfigGuardar', { telegramToken: '123:abc', telegramChatId: '-100200' }, adm));
  const n = E.X.correos.length; hora('2026-09-29', '07:40'); sinError(api('marcar', { tipo: 'entrada', ...GPS, lat: 4.71, lng: -74.2 }, tk[P]));
  const tg = E.X.correos.slice(n).filter((m) => m.to === 'telegram'); assert(tg.some((m) => m.body.includes('Llegada tarde')));
  assert(!tg.some((m) => m.body.includes('Pedro')), 'por defecto Telegram no lleva nombres');
});
t('archivo histórico: va a su propia carpeta y la rotación de copias no lo borra', () => {
  const X = E.X, cols = X.hojas.Marcaciones[0], iF = cols.indexOf('fecha'), iE = cols.indexOf('estado');
  for (let i = 0; i < 520; i++) { const r = cols.map(() => ''); r[0] = 'viejo' + i; r[1] = P; r[iF] = '2024-01-1' + (i % 9); r[3] = 'entrada'; r[iE] = 'ok'; X.hojas.Marcaciones.splice(1, 0, r); }
  X.hojas.Periodos.push(['2024-01-01', '2024-01-31', 'x', 'x']);
  hora('2026-09-30', '02:00'); S.limpiar(); S.archivarHistorico_(); S.limpiar();
  const hist = Object.values(X.archivos).find((a) => a.nombre && a.nombre.startsWith('Histórico Marcaciones')); assert(hist, 'se creó el histórico'); eq(hist.hojas.Marcaciones.length, 521);
  assert(hist.hojas.Marcaciones.slice(1).every((r) => r[cols.indexOf('lat')] === '' && r[cols.indexOf('foto')] === ''), 'el histórico no guarda GPS ni fotos');
  assert(hist.carpeta !== X.props.CARPETA_RESPALDOS); assert(!S.leer('Marcaciones').some((m) => m.id.startsWith('viejo')));
  sinError(api('adminConfigGuardar', { respaldoConservar: 1 }, adm)); for (let i = 0; i < 3; i++) sinError(api('adminRespaldar', {}, adm));
  assert(Object.values(X.archivos).includes(hist), 'el histórico sigue ahí');
});

t('préstamo grande: la cuota no deja el neto por debajo del mínimo y el saldo sigue para el siguiente periodo', () => {
  sinError(api('adminPrestamoGuardar', { cedula: P, concepto: 'Moto', monto: 3000000, cuotas: 1, autorizacion: FOTO }, adm));
  ['05', '06', '07', '08', '09'].forEach((d) => { hora('2026-10-' + d, '06:58'); sinError(api('marcar', { tipo: 'entrada', ...GPS, lat: 4.71, lng: -74.2 }, tk[P])); hora('2026-10-' + d, '16:24'); sinError(api('marcar', { tipo: 'salida', ...GPS, lat: 4.71, lng: -74.2 }, tk[P])); });
  hora('2026-10-17', '08:00'); S.leer('Marcaciones').filter((m) => m.estado === 'revisar' && m.fecha >= '2026-10-01').forEach((m) => sinError(api('adminMarcacionGuardar', { id: m.id, estado: 'ok' }, adm)));
  sinError(api('adminNominaCerrar', { desde: '2026-10-01', hasta: '2026-10-15' }, adm));
  const d = sinError(api('desprendibles', {}, tk[P])).find((x) => x.desde === '2026-10-01'); assert(d.neto > 0, 'neto positivo: ' + d.neto);
  const moto = sinError(api('adminPrestamos', {}, adm)).find((x) => x.concepto === 'Moto'); assert(moto.saldo > 0 && moto.saldo < 3000000, 'cuota reducida y saldo pendiente');
});

t('jornalero: la liquidación usa el jornal × 30 y el certificado dice que es diario', () => {
  const r = sinError(api('adminPersonaGuardar', { cedula: '70777888', nombre: 'Jorge Jornal', centroId: c1.id, rol: 'trabajador', salario: 70000, tipoPago: 'dia', ingreso: '2026-01-01' }, adm));
  const t2 = sinError(api('registro', { cedula: '70777888', codigo: r.codigo, clave: 'clave2026', consentimiento: CONS })).token;
  const l = sinError(api('adminLiquidacionContrato', { cedula: '70777888', fechaRetiro: '2026-06-30' }, adm));
  eq(l.salario, 2100000); eq(l.cesantias, Math.round(l.baseCesantias * 180 / 360)); assert(l.baseCesantias >= 2100000);
  const c = sinError(api('certificadoLaboral', { conSalario: true }, t2)); eq(c.empleado.salarioTipo, 'diario');
});
t('kiosco: solo un supervisor con su clave lo apaga; el kiosco no puede cerrarse solo', () => {
  hora('2026-10-20', '07:00'); const sup = sinError(api('login', { cedula: '79000001', clave: 'secreta1' })).token;
  const k = sinError(api('kioscoIniciar', { centroId: c1.id }, sup)).token;
  falla(api('salir', {}, k), 'PERMISO');
  falla(api('kioscoSalir', { cedula: P, clave: 'clave2026' }, k), 'CREDENCIALES'); // un trabajador no lo apaga
  sinError(api('kioscoSalir', { cedula: '79000001', clave: 'secreta1' }, k));
  falla(api('yo', {}, k), 'SESION');
});
t('liquidación registrada: queda en su hoja y cierra el préstamo descontado', () => {
  const antes = sinError(api('adminPrestamos', {}, adm)).filter((x) => x.cedula === P && x.estado === 'activo').length; assert(antes > 0);
  hora('2026-11-01', '08:00'); const l = sinError(api('adminLiquidacionContrato', { cedula: P, fechaRetiro: '2026-10-31', autorizaDescuento: true, guardar: true }, adm));
  assert(l.descuentoPrestamos <= Math.floor(l.salarioPendiente * 0.5) + l.prima + l.vacaciones + l.indemnizacion, 'no se descuenta de las cesantías');
  assert(l.id && S.leer('Liquidaciones').some((x) => x.id === l.id));
  assert(l.descuentoPrestamos > 0);
  hora('2026-11-02', '08:00'); sinError(api('adminNominaCerrar', { desde: '2026-10-16', hasta: '2026-10-31' }, adm));
  assert(!S.leer('Nomina').some((n) => n.cedula === P && n.desde === '2026-10-16'), 'ya liquidado: no se le paga dos veces');
  falla(api('adminLiquidacionContrato', { cedula: P, fechaRetiro: '2026-10-31', guardar: true }, adm), 'DATOS'); // no se registra dos veces
  falla(api('adminLiquidacionContrato', { cedula: '80111000', fechaRetiro: '2027-01-15', guardar: true }, adm), 'DATOS'); // ni con retiro futuro
});

t('seguridad: nadie bloquea el ingreso de todos ni la verificación de un certificado auténtico', () => {
  hora('2026-11-03', '08:00');
  for (let i = 0; i < 140; i++) api('login', { cedula: String(30000000 + i), clave: 'basura' });
  sinError(api('login', { cedula: '79000001', clave: 'secreta1' }));
  const c = sinError(api('certificadoLaboral', {}, tk['80111000']));
  for (let i = 0; i < 30; i++) api('certificadoVerificar', { cedula: '80111000', fecha: c.fecha, codigo: 'ZZZZZZZZZ' + (i % 10) });
  eq(sinError(api('certificadoVerificar', { cedula: '80111000', fecha: c.fecha, codigo: c.codigoVerificacion })).valido, true);
});
t('supresión: no quedan motivos de salud en alertas; las alertas no copian el motivo', () => {
  const r = sinError(api('adminPersonaGuardar', { cedula: '41222333', nombre: 'Marta Prueba', centroId: c1.id, rol: 'trabajador', salario: 1750905, ingreso: '2026-01-01' }, adm));
  const t3 = sinError(api('registro', { cedula: '41222333', codigo: r.codigo, clave: 'clave2026', consentimiento: CONS })).token;
  hora('2026-11-04', '09:00'); sinError(api('marcar', { tipo: 'entrada', ...GPS, manual: true, hora: '2026-11-04T07:00', motivo: 'cita de oncología' }, t3));
  assert(!S.leer('Alertas').some((a) => a.detalle.includes('oncología')), 'la alerta no copia el motivo');
  sinError(api('adminPersonaGuardar', { cedula: '41222333', nombre: 'Marta Prueba', salario: 1750905, estado: 'inactivo' }, adm));
  sinError(api('adminAnonimizarUsuario', { cedula: '41222333' }, adm));
  assert(!S.leer('Alertas').some((a) => a.cedula === '41222333' && a.detalle !== '[suprimido]'));
  assert(!S.leer('Marcaciones').some((m) => m.cedula === '41222333' && m.motivo.includes('oncología')));
});

t('salir a un permiso aprobado: registra la hora y cierra la jornada; por horas, registra el regreso', () => {
  const r = sinError(api('adminPersonaGuardar', { cedula: '43555666', nombre: 'Sofía Permiso', centroId: c1.id, rol: 'trabajador', salario: 1750905, ingreso: '2026-01-01' }, adm));
  const t4 = sinError(api('registro', { cedula: '43555666', codigo: r.codigo, clave: 'clave2026', consentimiento: CONS })).token;
  hora('2026-11-09', '06:58'); sinError(api('marcar', { tipo: 'entrada', ...GPS }, t4));
  const crea = (o) => { const p = sinError(api('permisoCrear', o, t4)); sinError(api('adminPermisoDecidir', { id: p.id, decision: 'aprobar', forzar: true }, adm)); return p.id; };
  const id1 = crea({ tipo: 'cita_medica', fechaSalida: '2026-11-09', horaSalida: '10:00', fechaRegreso: '2026-11-09', horaRegreso: '12:00', motivo: 'Cita de control' });
  let y = sinError(api('yo', {}, t4)); eq(y.hoy.permiso.id, id1); eq(y.hoy.permiso.fase, 'salir');
  hora('2026-11-09', '10:00'); const s1 = sinError(api('permisoSalir', { id: id1, ...GPS }, t4)); eq(s1.cerroJornada, false); eq(s1.hoy.permiso.fase, 'regresar');
  falla(api('permisoSalir', { id: id1, ...GPS }, t4), 'DATOS');
  hora('2026-11-09', '12:20'); const g = sinError(api('permisoRegresar', { id: id1, ...GPS }, t4)); eq(g.tarde, 20); eq(g.hoy.permiso, null);
  const id2 = crea({ tipo: 'cita_medica', fechaSalida: '2026-11-09', horaSalida: '15:00', fechaRegreso: '2026-11-10', horaRegreso: '07:00', motivo: 'Diligencia' });
  hora('2026-11-09', '15:00'); const s2 = sinError(api('permisoSalir', { id: id2, ...GPS }, t4)); eq(s2.cerroJornada, true); eq(s2.hoy.marcas.salida, '15:00');
  const otro = sinError(api('adminPermisos', {}, adm)).find((p) => p.id === id2); assert(otro.salidaReal, 'el panel ve la hora real');
});

/* ---- Licencia firmada por el proveedor ---- */
const CLAVE = 'clave-del-proveedor-para-pruebas';
function llave(plan, vence, extra, nit = '9001234567') { const b = Buffer.from(JSON.stringify({ plan, nit, modulosExtra: extra || [], vence })).toString('base64url'); return b + '.' + crypto.createHmac('sha256', CLAVE).update(b).digest('hex').slice(0, 32); }
const L = empresa({ reemplazar: [["var CLAVE_LICENCIA_PROVEEDOR = '';", `var CLAVE_LICENCIA_PROVEEDOR = '${CLAVE}';`]] });
t('licencia: sin llave rige el plan básico; los módulos de otros planes responden que no están incluidos', () => {
  falla(L.api('adminPrestamos', {}, L.adm), 'MODULO_NO_INCLUIDO'); sinError(L.api('adminTablero', {}, L.adm));
});
t('licencia: una llave falsificada, de otra empresa o sin vencimiento se rechaza; una válida activa el plan', () => {
  sinError(L.api('adminConfigGuardar', { empresa: { nombre: 'Montajes', nit: '900.123.456-7' } }, L.adm));
  falla(L.api('adminLicenciaActivar', { llave: llave('empresa', '2030-01-01').replace(/.$/, '0') }, L.adm), 'DATOS');
  falla(L.api('adminLicenciaActivar', { llave: llave('empresa', '2030-01-01', [], '800999111') }, L.adm), 'DATOS');
  falla(L.api('adminLicenciaActivar', { llave: llave('empresa', '') }, L.adm), 'DATOS');
  const r = sinError(L.api('adminLicenciaActivar', { llave: llave('profesional', '2026-12-31') }, L.adm)); eq(r.plan, 'profesional'); sinError(L.api('adminPrestamos', {}, L.adm));
});
t('licencia: 15 días de gracia tras vencer para cerrar nómina y renovar', () => {
  L.hora('2027-01-05', '06:00'); L.adm = sinError(L.api('login', { cedula: '79000001', clave: 'secreta1' })).token;
  const y = sinError(L.api('yo', {}, L.adm)); eq(y.licencia.enGracia, true); eq(y.licencia.vencida, false);
  sinError(L.api('adminPersonaGuardar', { cedula: '99999998', nombre: 'En gracia', salario: 1750905 }, L.adm));
});
t('licencia vencida: el panel queda en consulta, el personal sigue marcando y viendo lo suyo', () => {
  L.hora('2027-01-20', '06:58'); L.tk[P] = sinError(L.api('login', { cedula: P, clave: 'clave2026' })).token; sinError(L.api('marcar', { tipo: 'entrada', ...GPS }, L.tk[P]));
  L.adm = sinError(L.api('login', { cedula: '79000001', clave: 'secreta1' })).token; sinError(L.api('adminTablero', {}, L.adm)); sinError(L.api('desprendibles', {}, L.tk[P]));
  falla(L.api('adminPersonaGuardar', { cedula: '99999999', nombre: 'Nuevo', salario: 1 }, L.adm), 'LICENCIA_VENCIDA');
  sinError(L.api('adminLicenciaActivar', { llave: llave('profesional', '2027-12-31') }, L.adm)); sinError(L.api('adminPersonaGuardar', { cedula: '99999999', nombre: 'Nuevo', salario: 1750905 }, L.adm));
});
console.log(`Módulos: ${ok} pruebas correctas, ${mal} con error`); process.exit(mal ? 1 : 0);
