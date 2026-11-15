/**
 * CONTROL DE JORNADA — Instalación, tareas programadas, copias de seguridad y retención de datos.
 */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Control de jornada')
    .addItem('1. Instalar o reparar', 'instalar')
    .addItem('Ver código del primer administrador', 'verCodigoAdmin')
    .addItem('Hacer copia de seguridad ahora', 'respaldarAhora')
    .addItem('Probar funcionamiento', 'probarFuncionamiento')
    .addToUi();
}
function aviso_(t) { try { SpreadsheetApp.getUi().alert(t); } catch (e) { Logger.log(t); } }

/** Ejecutar UNA vez desde el menú (o desde el editor). Se puede repetir sin perder datos. */
function instalar() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(); prop_('SS_ID', ss.getId());
  Object.keys(HOJAS).forEach(function (h) { hoja_(h); });
  if (!prop_('SECRETO')) prop_('SECRETO', azar_() + azar_());
  var raiz = DriveApp.getFileById(ss.getId()).getParents(), padre = raiz.hasNext() ? raiz.next() : DriveApp.getRootFolder();
  if (!prop_('CARPETA_FOTOS')) prop_('CARPETA_FOTOS', padre.createFolder('Control de jornada - Fotos y soportes (privado)').getId());
  if (!prop_('CARPETA_RESPALDOS')) prop_('CARPETA_RESPALDOS', padre.createFolder('Control de jornada - Copias de seguridad').getId());
  var hayAdmin = leer('Usuarios').some(function (u) { return u.rol === 'admin' && u.hash; });
  if (!hayAdmin && !prop_('CODIGO_ADMIN')) prop_('CODIGO_ADMIN', 'ADM-' + azar_().substr(0, 10).toUpperCase());
  if (!cfg_().codigoEmpresa) cfgSet_('codigoEmpresa', codigo6_());
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('tareaCada5').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('tareaCada15').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('tareaDiaria').timeBased().atHour(2).everyDays(1).create();
  var s1 = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1'); if (s1 && s1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s1);
  aviso_('Instalación lista.\n\n' + (prop_('CODIGO_ADMIN') ? 'Código del primer administrador (un solo uso):\n' + prop_('CODIGO_ADMIN') + '\n\nÚsalo como "código de activación" al registrarte en la aplicación.\n\n' : 'Ya existe un administrador.\n\n') +
    'Siguiente paso: Implementar > Nueva implementación > Aplicación web (Ejecutar como: yo · Acceso: cualquier persona) y copiar la URL en config.js.');
}
function verCodigoAdmin() { aviso_(prop_('CODIGO_ADMIN') ? 'Código del primer administrador: ' + prop_('CODIGO_ADMIN') : 'El código ya fue usado. Los nuevos administradores se crean desde el panel.'); }
function respaldarAhora() { aviso_(respaldar_()); }
function probarFuncionamiento() { aviso_(autoPrueba_().map(function (p) { return (p.ok ? '✔ ' : '✘ ') + p.nombre; }).join('\n')); }

function tarea_(nombre, fn) {
  _c = {}; _cfg = null;
  var lock = LockService.getScriptLock(); if (!lock.tryLock(20000)) return;
  try { fn(); } catch (e) { registrarError_('tarea:' + nombre, e); try { alertar_('error_sistema', '', 'Falló la tarea programada "' + nombre + '": ' + e.message); } catch (x) { } }
  finally { lock.releaseLock(); }
}
function unaVez_(clave, seg) { var c = CacheService.getScriptCache(); if (c.get(clave)) return false; c.put(clave, '1', seg || 21600); return true; }
function lista_(clave, fecha) { var v = json_(prop_(clave), {}); return v.f === fecha ? v : { f: fecha, l: [] }; }
function cubierto_(cedula, fecha, incs) {
  return incs.some(function (i) { return i.cedula === cedula && i.desde <= fecha && fecha <= i.hasta; }) || permisosAprobados_(cedula).some(function (p) { return p.desde <= fecha && fecha <= p.hasta && !p.horas; });
}

/** Cada 5 minutos: recordatorios de marcación por correo y vencimiento de permisos sin respuesta. */
function tareaCada5() { tarea_('cada5', function () {
  var a = ahora_(), c = cfg_(), ahoraMin = Motor.aMin(a.hora);
  leer('Permisos').forEach(function (p) {
    if (p.estado !== 'en_firmas' || +p.limite > a.ms) return;
    p.estado = 'vencido'; p.obs = 'Venció el plazo de ' + c.horasLimitePermiso + ' h sin todas las firmas.'; guardar('Permisos', p);
    alertar_('permiso_vencido', p.cedula, 'El permiso del ' + p.fechaSalida + ' venció sin todas las firmas. El administrador puede decidirlo desde el panel.');
    var u = buscar('Usuarios', 'cedula', p.cedula); if (u && u.email) correo_(u.email, 'Tu permiso no fue respondido a tiempo', 'Tu solicitud del ' + p.fechaSalida + ' venció sin respuesta. Comunícate con tu jefe o con el administrador.');
  });
  if (!c.recordatorioCorreo) return;
  var marc = leer('Marcaciones', 15000), incs = leer('Incapacidades'), cs = {}; centros_().forEach(function (x) { cs[x.id] = x; });
  leer('Usuarios').forEach(function (u) {
    if (u.estado !== 'activo' || !u.email) return;
    var hor = horarioDe_(cs[u.centroId], a.fecha); if (!hor) return;
    var d = diasDe_(marc, u.cedula, a.fecha, a.fecha)[0] || {}, rec = +c.recordatorioMin || 5;
    [['entrada', hor.e, !d.entrada], ['sal_alm', hor.ai, d.entrada && !d.salAlm && !d.salida], ['ent_alm', hor.af, d.salAlm && !d.entAlm && !d.salida], ['salida', hor.s, d.entrada && !d.salida]].forEach(function (x) {
      if (!x[1] || !x[2]) return; var t = Motor.aMin(x[1]) + rec;
      if (ahoraMin < t || ahoraMin >= t + 10 || !unaVez_('rec:' + u.cedula + a.fecha + x[0])) return;
      if (x[0] === 'entrada' && cubierto_(u.cedula, a.fecha, incs)) return;
      correo_(u.email, 'Recuerda marcar: ' + NOMBRE_TIPO[x[0]], 'Hola ' + u.nombre.split(' ')[0] + ', aún no registras "' + NOMBRE_TIPO[x[0]] + '" de hoy (' + x[1] + ').\nAbre la aplicación y márcala: ' + c.urlApp);
    });
  });
}); }

/** Cada 15 minutos: personas que no se presentaron y jornadas que quedaron sin salida. */
function tareaCada15() { tarea_('cada15', function () {
  var a = ahora_(), c = cfg_(), ahoraMin = Motor.aMin(a.hora), marc = leer('Marcaciones', 15000), incs = leer('Incapacidades'), cs = {}; centros_().forEach(function (x) { cs[x.id] = x; });
  var aus = lista_('AVISO_AUSENCIA', a.fecha), inc = lista_('AVISO_INCOMPLETO', a.fecha), ayer = Motor.sumar(a.fecha, -1);
  leer('Usuarios').forEach(function (u) {
    if (u.estado !== 'activo') return;
    var hor = horarioDe_(cs[u.centroId], a.fecha), d = diasDe_(marc, u.cedula, ayer, a.fecha), hoy = null, prev = null;
    d.forEach(function (x) { if (x.fecha === a.fecha) hoy = x; else prev = x; });
    if (hor && !hoy && aus.l.indexOf(u.cedula) < 0 && ahoraMin >= Motor.aMin(hor.e) + (+c.minutosAusencia || 60) && !cubierto_(u.cedula, a.fecha, incs)) {
      aus.l.push(u.cedula); alertar_('ausencia', u.cedula, 'No ha registrado entrada hoy. Su horario empezaba a las ' + hor.e + (cs[u.centroId] ? ' en ' + cs[u.centroId].nombre : '') + ' y no tiene permiso ni incapacidad registrados.');
    }
    if (prev && prev.entrada && !prev.salida && inc.l.indexOf(u.cedula) < 0 && isoMs_(a.iso) - isoMs_(prev.fecha + 'T' + prev.entrada) > 16 * 3600000) {
      inc.l.push(u.cedula); alertar_('incompleto', u.cedula, 'La jornada del ' + prev.fecha + ' quedó sin salida. Mientras no se complete, ese día no suma horas.');
      if (u.email) correo_(u.email, 'Te faltó marcar la salida de ayer', 'Tu jornada del ' + prev.fecha + ' quedó sin salida. Entra a la aplicación y usa "Se me olvidó marcar" para poner la hora en que saliste: ' + c.urlApp);
    }
  });
  prop_('AVISO_AUSENCIA', JSON.stringify(aus)); prop_('AVISO_INCOMPLETO', JSON.stringify(inc));
}); }

/** Diaria (2:00 a. m.): retención de fotos y GPS, sesiones vencidas, resumen de extras y copia de seguridad. */
function tareaDiaria() { tarea_('diaria', function () {
  var a = ahora_(), c = cfg_();
  limpiarDatos_();
  leer('Sesiones').filter(function (s) { return +s.expira < a.ms; }).sort(function (x, y) { return y._f - x._f; }).forEach(function (s) { borrar('Sesiones', s); });
  var pend = leer('Extras').filter(function (x) { return x.estado === 'pendiente'; }).length;
  if (pend) alertar_('extras_pendientes', '', 'Hay ' + pend + ' registro(s) de horas extra esperando aprobación. Las horas extra sin aprobar no entran a la nómina.');
  var ult = prop_('ULTIMO_RESPALDO');
  if (c.respaldoCadaDias > 0 && (!ult || Motor.diasEntre(ult.substr(0, 10), a.fecha) >= c.respaldoCadaDias)) respaldar_();
}); }

/** Política de retención automática: no depende de que alguien abra el panel. */
function limpiarDatos_() {
  var a = ahora_(), c = cfg_(), h = hoja_('Marcaciones'), cols = HOJAS.Marcaciones, n = h.getLastRow() - 1; if (n < 1) return;
  var limFoto = Motor.sumar(a.fecha, -c.retencionFotosDias), limGps = Motor.sumar(a.fecha, -c.retencionGpsDias);
  var iF = cols.indexOf('fecha'), iFo = cols.indexOf('foto'), iLa = cols.indexOf('lat'), iLn = cols.indexOf('lng'), iPr = cols.indexOf('prec');
  var v = h.getRange(2, 1, n, cols.length).getValues(), cambios = 0, borradas = 0;
  for (var i = 0; i < v.length && borradas < 400; i++) {
    var f = String(v[i][iF]);
    if (v[i][iFo] && f < limFoto) { try { DriveApp.getFileById(String(v[i][iFo])).setTrashed(true); } catch (e) { } v[i][iFo] = ''; cambios++; borradas++; }
    if (v[i][iLa] !== '' && f < limGps) { v[i][iLa] = ''; v[i][iLn] = ''; v[i][iPr] = ''; cambios++; }
  }
  if (cambios) { h.getRange(2, 1, n, cols.length).setValues(v); sucio_('Marcaciones'); }
  prop_('ULTIMA_LIMPIEZA', a.iso + ' · ' + borradas + ' foto(s) eliminada(s)');
}

/** Copia completa de la hoja de cálculo a la carpeta de respaldos. Conserva las últimas N. */
function respaldar_() {
  var a = ahora_(), c = cfg_(), msg;
  try {
    var carpeta = DriveApp.getFolderById(prop_('CARPETA_RESPALDOS'));
    DriveApp.getFileById(ss_().getId()).makeCopy('Respaldo ' + a.iso.replace('T', ' ').replace(':', 'h') + ' - ' + c.empresa.nombre, carpeta);
    var arch = [], it = carpeta.getFiles(); while (it.hasNext()) arch.push(it.next());
    arch.sort(function (x, y) { return y.getDateCreated() - x.getDateCreated(); }).slice(Math.max(1, c.respaldoConservar)).forEach(function (f) { f.setTrashed(true); });
    prop_('ULTIMO_RESPALDO', a.iso); msg = 'Copia de seguridad creada el ' + a.iso.replace('T', ' ') + '. Se conservan las últimas ' + c.respaldoConservar + '.';
  } catch (e) { msg = 'La copia de seguridad FALLÓ: ' + e.message; registrarError_('respaldo', e); }
  alertar_('respaldo', '', msg); return msg;
}
