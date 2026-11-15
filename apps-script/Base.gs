/**
 * CONTROL DE JORNADA — Backend en Google Apps Script sobre Google Sheets.
 * Base: acceso a datos, seguridad, configuración y enrutador de la API.
 * Una hoja de cálculo = una empresa. Nada de la empresa está escrito en el código: todo vive en la hoja Config.
 */
var VERSION = '1.0.0';
var _AHORA = null; // solo para pruebas

var HOJAS = {
  Config: ['clave', 'valor'],
  Usuarios: ['cedula', 'nombre', 'cargo', 'rol', 'centroId', 'salario', 'salarioOk', 'tipoPago', 'email', 'telefono', 'ingreso', 'eps', 'arl', 'estado', 'hash', 'salt', 'codigo', 'consVersion', 'consFecha', 'creado'],
  Sesiones: ['hash', 'cedula', 'creado', 'expira', 'equipo'],
  Centros: ['id', 'nombre', 'cliente', 'direccion', 'lat', 'lng', 'radio', 'horario', 'tol', 'festivos', 'activo'],
  Jefes: ['id', 'nombre', 'cargo', 'email', 'whatsapp', 'pin', 'centros', 'activo'],
  Marcaciones: ['id', 'cedula', 'fecha', 'tipo', 'hora', 'servidor', 'lat', 'lng', 'prec', 'dist', 'enZona', 'centroId', 'foto', 'fotoExigida', 'manual', 'motivo', 'estado', 'horario', 'origen', 'editadoPor'],
  Permisos: ['id', 'cedula', 'tipo', 'cat', 'remunerado', 'fechaSalida', 'horaSalida', 'fechaRegreso', 'horaRegreso', 'motivo', 'soporte', 'estado', 'creado', 'limite', 'firmas', 'decididoPor', 'decididoEl', 'obs'],
  Incapacidades: ['id', 'cedula', 'tipo', 'desde', 'hasta', 'entidad', 'nota', 'soporte', 'registradoPor', 'creado'],
  Extras: ['id', 'cedula', 'fecha', 'minCalc', 'minAprob', 'estado', 'decididoPor', 'decididoEl', 'obs'],
  Nomina: ['id', 'desde', 'hasta', 'cedula', 'nombre', 'neto', 'detalle', 'generado'],
  Periodos: ['desde', 'hasta', 'cerradoPor', 'cerradoEl'],
  Alertas: ['fecha', 'tipo', 'cedula', 'detalle', 'enviadoA', 'estado'],
  Auditoria: ['fecha', 'actor', 'accion', 'detalle'],
  Errores: ['fecha', 'cedula', 'origen', 'mensaje', 'detalle', 'equipo', 'version']
};

var TIPOS_ALERTA = {
  tardanza: 'Llegada tarde', ausencia: 'No se presentó', fuera_zona: 'Marcación fuera del centro de trabajo',
  marcacion_manual: 'Marcación con hora digitada', bloqueo_permisos: 'Bloqueó la ubicación o la cámara', sin_foto: 'Marcación sin la foto exigida',
  incompleto: 'Jornada sin salida', permiso_nuevo: 'Nueva solicitud de permiso', permiso_vencido: 'Permiso sin respuesta a tiempo',
  permiso_resuelto: 'Permiso aprobado o rechazado', extras_tope: 'Horas extra por encima del tope legal', extras_pendientes: 'Horas extra por aprobar',
  registro_nuevo: 'Nuevo usuario por aprobar', respaldo: 'Resultado de la copia de seguridad', error_sistema: 'Error del sistema'
};

var CFG_DEF = {
  empresa: { nombre: 'Mi empresa', nit: '', direccion: '', telefono: '', logo: '', color: '', correoDatos: '', responsableDatos: '', titularSoftware: '' },
  urlApp: '', zona: 'America/Bogota', periodoNomina: 'quincenal',
  fotoProbabilidad: 30, geocercaEstricta: false, radioDefecto: 150, toleranciaMin: 5, recordatorioMin: 5, recordatorioCorreo: false,
  minutosAusencia: 60, diasAtrasManual: 3, horasLimitePermiso: 24, aprobacionFinalAdmin: true,
  autoRegistro: true, codigoEmpresa: '', sesionDias: 90,
  correoAlertas: '', alertas: {},
  retencionFotosDias: 30, retencionGpsDias: 365, respaldoCadaDias: 7, respaldoConservar: 8,
  versionLegal: '2026-11',
  legal: {} // parámetros del motor que la empresa quiera sobrescribir
};
var CFG_PUBLICAS = ['empresa', 'versionLegal', 'autoRegistro'];

/* ---------- Utilidades ---------- */
function E_(cod, msg) { var e = new Error(msg); e.cod = cod; return e; }
function ss_() {
  var s = SpreadsheetApp.getActiveSpreadsheet();
  if (!s) s = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SS_ID'));
  return s;
}
function prop_(k, v) { var p = PropertiesService.getScriptProperties(); if (v === undefined) return p.getProperty(k); if (v === null) p.deleteProperty(k); else p.setProperty(k, String(v)); return v; }
function ahora_() {
  var d = _AHORA ? new Date(_AHORA) : new Date(), z = cfg_().zona;
  var s = Utilities.formatDate(d, z, "yyyy-MM-dd'T'HH:mm");
  return { iso: s, fecha: s.substr(0, 10), hora: s.substr(11, 5), ms: d.getTime() };
}
function isoMs_(iso) { var p = String(iso).match(/(\d+)-(\d+)-(\d+)T(\d+):(\d+)/); return p ? Date.UTC(+p[1], +p[2] - 1, +p[3], +p[4], +p[5]) : NaN; } // diferencia entre horas locales
function hex_(bytes) { return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join(''); }
function sha_(s) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)); }
function hmac_(s) { return hex_(Utilities.computeHmacSha256Signature(s, prop_('SECRETO'))); }
function hashClave_(clave, salt) { var h = salt + '|' + clave; for (var i = 0; i < 150; i++) h = sha_(h + salt); return h; }
function azar_() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''); }
function codigo6_() { return String(parseInt(azar_().substr(0, 8), 16) % 900000 + 100000); }
function id_() { return azar_().substr(0, 16); }
function soloDigitos_(s) { return String(s || '').replace(/\D/g, ''); }
function txt_(s, max) { return String(s === undefined || s === null ? '' : s).replace(/[\u0000-\u0008\u000B-\u001F]/g, '').trim().substr(0, max || 300); }
function json_(s, def) { try { return s ? JSON.parse(s) : def; } catch (e) { return def; } }
function distancia_(a, b, c, d) {
  var R = 6371000, r = Math.PI / 180, x = (c - a) * r, y = (d - b) * r, q = Math.sin(x / 2) * Math.sin(x / 2) + Math.cos(a * r) * Math.cos(c * r) * Math.sin(y / 2) * Math.sin(y / 2);
  return Math.round(2 * R * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q)));
}
function limite_(clave, max, seg) {
  var c = CacheService.getScriptCache(), k = 'rl:' + clave, n = +(c.get(k) || 0);
  if (n >= max) throw E_('DEMASIADOS', 'Demasiados intentos. Espera unos minutos y vuelve a intentar.');
  c.put(k, String(n + 1), seg);
}

/* ---------- Acceso a hojas ---------- */
var _c = {};
function hoja_(n) {
  var s = ss_(), h = s.getSheetByName(n);
  if (!h) {
    h = s.insertSheet(n); var cols = HOJAS[n];
    h.getRange(1, 1, h.getMaxRows(), cols.length).setNumberFormat('@'); // todo texto: Sheets no convierte cédulas ni fechas
    h.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold'); h.setFrozenRows(1);
  }
  return h;
}
function celda_(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') v = JSON.stringify(v);
  v = String(v); if (v.length > 49000) v = v.substr(0, 49000);
  return /^[=+\-@]/.test(v) ? "'" + v : v; // evita inyección de fórmulas
}
function leer(n, cola) {
  var k = n + '|' + (cola || ''); if (_c[k]) return _c[k];
  var h = hoja_(n), last = h.getLastRow(), cols = HOJAS[n];
  if (last < 2) return (_c[k] = []);
  var ini = cola && last - 1 > cola ? last - cola + 1 : 2;
  var v = h.getRange(ini, 1, last - ini + 1, cols.length).getValues();
  return (_c[k] = v.map(function (r, i) {
    var o = { _f: ini + i };
    cols.forEach(function (c, j) { var x = r[j]; o[c] = x === null || x === undefined ? '' : (x instanceof Date ? Utilities.formatDate(x, 'America/Bogota', "yyyy-MM-dd'T'HH:mm") : String(x)); });
    return o;
  }));
}
function sucio_(n) { Object.keys(_c).forEach(function (k) { if (k.indexOf(n + '|') === 0) delete _c[k]; }); if (n === 'Config') _cfg = null; }
function agregar(n, o) { hoja_(n).appendRow(HOJAS[n].map(function (c) { return celda_(o[c]); })); sucio_(n); return o; }
function guardar(n, o) { hoja_(n).getRange(o._f, 1, 1, HOJAS[n].length).setValues([HOJAS[n].map(function (c) { return celda_(o[c]); })]); sucio_(n); return o; }
function borrar(n, o) { hoja_(n).deleteRow(o._f); sucio_(n); }
function buscar(n, campo, valor, cola) { var l = leer(n, cola); for (var i = l.length - 1; i >= 0; i--) if (l[i][campo] === String(valor)) return l[i]; return null; }

/* ---------- Configuración ---------- */
var _cfg = null;
function cfg_() {
  if (_cfg) return _cfg;
  var o = JSON.parse(JSON.stringify(CFG_DEF));
  leer('Config').forEach(function (r) {
    var v = json_(r.valor, undefined); if (v === undefined) return;
    if (o[r.clave] && typeof o[r.clave] === 'object' && !Array.isArray(o[r.clave]) && typeof v === 'object') { for (var k in v) o[r.clave][k] = v[k]; } else o[r.clave] = v;
  });
  return (_cfg = o);
}
function cfgSet_(clave, valor) {
  var r = buscar('Config', 'clave', clave);
  if (r) { r.valor = JSON.stringify(valor); guardar('Config', r); } else agregar('Config', { clave: clave, valor: JSON.stringify(valor) });
  _cfg = null;
}
function legal_() { return Motor.cfg(cfg_().legal); }

/* ---------- Auditoría, alertas, errores ---------- */
function auditar_(actor, accion, detalle) { agregar('Auditoria', { fecha: ahora_().iso, actor: actor, accion: accion, detalle: txt_(typeof detalle === 'string' ? detalle : JSON.stringify(detalle), 2000) }); }
function correo_(para, asunto, cuerpo) {
  para = String(para || '').split(/[,; ]+/).filter(function (x) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x); });
  if (!para.length) return '';
  try {
    if (MailApp.getRemainingDailyQuota() < para.length) return 'SIN CUPO DE CORREO';
    MailApp.sendEmail({ to: para.join(','), subject: '[' + cfg_().empresa.nombre + '] ' + asunto, body: cuerpo + '\n\n— Control de jornada · mensaje automático', name: cfg_().empresa.nombre });
    return para.join(',');
  } catch (e) { return 'FALLÓ: ' + e.message; }
}
function alertar_(tipo, cedula, detalle) {
  var c = cfg_(), a = (c.alertas || {})[tipo] || {}, activo = a.activo !== false, para = a.correos || c.correoAlertas, enviado = '';
  if (activo && para) {
    var u = cedula ? buscar('Usuarios', 'cedula', cedula) : null;
    enviado = correo_(para, TIPOS_ALERTA[tipo] + (u ? ': ' + u.nombre : ''), (u ? u.nombre + ' (C.C. ' + cedula + ')\n' : '') + detalle + '\n\nFecha: ' + ahora_().iso.replace('T', ' '));
  }
  agregar('Alertas', { fecha: ahora_().iso, tipo: tipo, cedula: cedula || '', detalle: txt_(detalle, 500), enviadoA: enviado, estado: !activo ? 'desactivada' : enviado && enviado.indexOf('@') > 0 ? 'enviada' : 'registrada' });
}
function registrarError_(origen, err, extra) {
  try {
    agregar('Errores', { fecha: ahora_().iso, cedula: (extra && extra.cedula) || '', origen: origen, mensaje: txt_(err && err.message ? err.message : err, 400), detalle: txt_(err && err.stack ? err.stack : (extra && extra.detalle) || '', 1500), equipo: txt_(extra && extra.equipo, 200), version: (extra && extra.version) || VERSION });
  } catch (e) { /* nunca romper por registrar */ }
}

/* ---------- Sesiones ---------- */
function crearSesion_(cedula, equipo) {
  var t = azar_(), a = ahora_();
  agregar('Sesiones', { hash: sha_(t), cedula: cedula, creado: a.iso, expira: String(a.ms + cfg_().sesionDias * 86400000), equipo: txt_(equipo, 120) });
  return t;
}
function usuarioDeToken_(t) {
  if (!t || String(t).length < 40) throw E_('SESION', 'Tu sesión terminó. Ingresa de nuevo.');
  var h = sha_(String(t)), cache = CacheService.getScriptCache(), ced = cache.get('ses:' + h);
  if (!ced) {
    var s = buscar('Sesiones', 'hash', h);
    if (!s || +s.expira < ahora_().ms) throw E_('SESION', 'Tu sesión terminó. Ingresa de nuevo.');
    ced = s.cedula; cache.put('ses:' + h, ced, 1800);
  }
  var u = buscar('Usuarios', 'cedula', ced);
  if (!u || (u.estado !== 'activo' && u.estado !== 'pendiente')) throw E_('SESION', 'Tu usuario no está activo. Habla con el administrador.');
  return u;
}
function cerrarSesiones_(cedula, soloHash) {
  var cache = CacheService.getScriptCache();
  leer('Sesiones').filter(function (s) { return s.cedula === cedula && (!soloHash || s.hash === soloHash); })
    .sort(function (a, b) { return b._f - a._f; }).forEach(function (s) { cache.remove('ses:' + s.hash); borrar('Sesiones', s); });
}
function usuarioPublico_(u) {
  return { cedula: u.cedula, nombre: u.nombre, cargo: u.cargo, rol: u.rol, centroId: u.centroId, salario: +u.salario || 0, salarioOk: u.salarioOk === '1', tipoPago: u.tipoPago || 'mensual',
    email: u.email, telefono: u.telefono, ingreso: u.ingreso, eps: u.eps, arl: u.arl, estado: u.estado, consVersion: u.consVersion, tieneClave: !!u.hash };
}

/* ---------- Enrutador ---------- */
var ACCIONES = {}; // nombre -> {fn, rol: 'publico' | 'usuario' | 'admin', escribe}
function accion_(nombre, rol, escribe, fn) { ACCIONES[nombre] = { fn: fn, rol: rol, escribe: escribe }; }

function despachar_(req) {
  _c = {}; _cfg = null;
  if (!ACCIONES.publico) registrarAcciones_();
  var a = ACCIONES[req && req.a];
  if (!a) throw E_('ACCION', 'Acción desconocida.');
  var lock = null;
  if (a.escribe) { lock = LockService.getScriptLock(); if (!lock.tryLock(25000)) throw E_('OCUPADO', 'El sistema está ocupado. Intenta de nuevo en unos segundos.'); }
  try {
    var u = null;
    if (a.rol !== 'publico') {
      u = usuarioDeToken_(req.t);
      if (a.rol === 'admin' && (u.rol !== 'admin' || u.estado !== 'activo')) throw E_('PERMISO', 'Esta acción es solo para administradores.');
    }
    return { ok: true, d: a.fn(req.d || {}, u, req) };
  } finally { if (lock) lock.releaseLock(); }
}
function doPost(e) {
  var out, req = null;
  try { req = JSON.parse(e.postData.contents); out = despachar_(req); }
  catch (err) {
    if (err && err.cod) out = { ok: false, e: err.cod, m: err.message };
    else { registrarError_('servidor:' + (req && req.a), err); out = { ok: false, e: 'ERROR', m: 'Algo falló en el servidor. El error quedó registrado para revisión.' }; }
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
function doGet() { return ContentService.createTextOutput(JSON.stringify({ ok: true, servicio: 'control-jornada', version: VERSION })).setMimeType(ContentService.MimeType.JSON); }
