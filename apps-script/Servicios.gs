/**
 * CONTROL DE JORNADA — Servicios de la API.
 */
var TIPOS = ['entrada', 'sal_alm', 'ent_alm', 'salida'];
var NOMBRE_TIPO = { entrada: 'Entrada', sal_alm: 'Salida a almuerzo', ent_alm: 'Regreso de almuerzo', salida: 'Salida' };

/* ---------- Lecturas comunes ---------- */
function centros_() {
  return leer('Centros').map(function (c) {
    return { _f: c._f, id: c.id, nombre: c.nombre, cliente: c.cliente, direccion: c.direccion, lat: c.lat === '' ? null : +c.lat, lng: c.lng === '' ? null : +c.lng,
      radio: +c.radio || cfg_().radioDefecto, horario: json_(c.horario, {}), tol: c.tol === '' ? cfg_().toleranciaMin : +c.tol, festivos: c.festivos === '1', activo: c.activo !== '0' };
  });
}
function centroDe_(id) { var l = centros_(); for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
function centroPub_(c) { var o = {}; ['id', 'nombre', 'cliente', 'direccion', 'lat', 'lng', 'radio', 'horario', 'tol', 'festivos', 'activo'].forEach(function (k) { o[k] = c[k]; }); return o; }
function horarioDe_(centro, fecha) {
  if (!centro) return null;
  var h = Motor.horarioDia(centro.horario, fecha, legal_(), centro.festivos); if (!h) return null;
  return { e: h.e, s: h.s, ai: h.ai || '', af: h.af || '', tol: centro.tol };
}
// Agrupa las marcaciones válidas de una persona en días de jornada.
function diasDe_(marc, cedula, desde, hasta) {
  var m = {};
  marc.forEach(function (r) {
    if (r.cedula !== cedula || r.estado === 'anulada' || r.fecha < desde || r.fecha > hasta) return;
    var d = m[r.fecha] || (m[r.fecha] = { fecha: r.fecha, horario: null, centroId: r.centroId, marcas: [] });
    var k = { entrada: 'entrada', sal_alm: 'salAlm', ent_alm: 'entAlm', salida: 'salida' }[r.tipo];
    d[k] = r.hora.substr(11, 5);
    if (r.tipo === 'entrada' || !d.horario) { d.horario = json_(r.horario, null) || d.horario; d.centroId = r.centroId || d.centroId; }
    d.marcas.push({ id: r.id, tipo: r.tipo, hora: r.hora, manual: r.manual === '1', estado: r.estado, enZona: r.enZona, dist: r.dist, foto: r.foto, fotoExigida: r.fotoExigida === '1', motivo: r.motivo, origen: r.origen, centroId: r.centroId, lat: r.lat, lng: r.lng });
  });
  return Object.keys(m).sort().map(function (f) { return m[f]; });
}
function fotoRequerida_(cedula, fecha, tipo) {
  var p = +cfg_().fotoProbabilidad;
  if (p <= 0) return false; if (p >= 100) return true;
  return parseInt(hmac_('foto|' + cedula + '|' + fecha + '|' + tipo).substr(0, 6), 16) % 100 < p;
}
function periodoCerrado_(fecha) { return leer('Periodos').some(function (p) { return p.desde <= fecha && fecha <= p.hasta; }); }
function guardarImagen_(dataUrl, nombre, carpeta) {
  var m = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) throw E_('FOTO', 'La foto no llegó bien. Tómala de nuevo.');
  if (m[2].length > 700000) throw E_('FOTO', 'La foto pesa demasiado. Tómala de nuevo.');
  return DriveApp.getFolderById(prop_(carpeta)).createFile(Utilities.newBlob(Utilities.base64Decode(m[2]), 'image/' + m[1], nombre)).getId();
}
function permisosAprobados_(cedula) {
  return leer('Permisos').filter(function (p) { return p.cedula === cedula && p.estado === 'aprobado'; }).map(function (p) {
    var mismo = p.fechaSalida === p.fechaRegreso, horas = null;
    if (mismo && p.horaSalida && p.horaRegreso) horas = Math.max(0, Math.round((Motor.aMin(p.horaRegreso) - Motor.aMin(p.horaSalida)) / 6) / 10);
    return { desde: p.fechaSalida, hasta: mismo ? p.fechaSalida : Motor.sumar(p.fechaRegreso, -1), remunerado: p.remunerado === '1', horas: horas, tipo: p.tipo };
  });
}
function insumos_(u, desde, hasta, corte, marc) {
  var centro = centroDe_(u.centroId), ext = {};
  leer('Extras').forEach(function (x) { if (x.cedula === u.cedula && x.estado === 'aprobada') ext[x.fecha] = +x.minAprob || 0; });
  return { usuario: { salario: +u.salario || 0, tipoPago: u.tipoPago || 'mensual' }, desde: desde, hasta: hasta, corte: corte, ingreso: u.ingreso || '',
    dias: diasDe_(marc, u.cedula, Motor.lunesDe(desde), hasta), extras: ext, horario: centro ? centro.horario : null, trabajaFestivos: centro ? centro.festivos : false,
    permisos: permisosAprobados_(u.cedula),
    incapacidades: leer('Incapacidades').filter(function (i) { return i.cedula === u.cedula; }).map(function (i) { return { desde: i.desde, hasta: i.hasta, tipo: i.tipo }; }) };
}
function sinDetalle_(l) { var o = {}; for (var k in l) if (k !== 'porFecha') o[k] = l[k]; return o; }

/* ---------- Estado del día y resumen del trabajador ---------- */
function estadoHoy_(u, marc) {
  var a = ahora_(), ayer = Motor.sumar(a.fecha, -1), dias = diasDe_(marc, u.cedula, ayer, a.fecha), hoy = null, prev = null;
  dias.forEach(function (d) { if (d.fecha === a.fecha) hoy = d; else prev = d; });
  var fecha = a.fecha;
  if (!hoy && prev && prev.entrada && !prev.salida && (a.ms - isoMs_(ayer + 'T' + prev.entrada) + (isoMs_(a.iso) - a.ms)) < 16 * 3600000) { hoy = prev; fecha = ayer; } // turno nocturno abierto
  var marcas = {}; if (hoy) hoy.marcas.forEach(function (m) { marcas[m.tipo] = m.hora.substr(11, 5); });
  var sig = !marcas.entrada ? 'entrada' : marcas.salida ? null : (!marcas.sal_alm ? 'sal_alm' : !marcas.ent_alm ? 'ent_alm' : 'salida');
  var centro = centroDe_((hoy && hoy.centroId) || u.centroId), plan = {};
  TIPOS.forEach(function (t) { plan[t] = fotoRequerida_(u.cedula, fecha, t); });
  return { fecha: fecha, marcas: marcas, siguiente: sig, fotoPlan: plan, horario: (hoy && hoy.horario) || horarioDe_(centro, fecha), centroId: centro ? centro.id : '', festivo: Motor.esFestivo(fecha, legal_()) };
}
function resumen_(u, marc) {
  var a = ahora_(), c = cfg_(), per = Motor.periodoDe(a.fecha, c.periodoNomina), L = legal_();
  var ins = insumos_(u, per.desde, per.hasta, a.fecha, marc), hoyD = null;
  ins.dias.forEach(function (d) { if (d.fecha === a.fecha) hoyD = d; });
  // el día de hoy aún abierto no debe contar como ausencia ni incompleto
  var liq = Motor.liquidarPeriodo(ins, L);
  liq.incompletos = liq.incompletos.filter(function (f) { return f !== a.fecha; });
  var resto = Motor.diasNomina(per.desde, per.hasta) - liq.diasNomina, vDia = (+u.salario || 0) / 30;
  var aux = (+u.salario || 0) <= L.smmlv * L.topeAuxSmmlv ? L.auxTransporte / 30 : 0;
  var proy = u.tipoPago === 'dia' ? liq.neto : liq.neto + Math.round(resto * (vDia * (1 - L.pctSalud - L.pctPension) + aux));
  var o = sinDetalle_(liq); o.proyeccion = proy; o.periodo = per;
  o.dias = ins.dias.filter(function (d) { return d.fecha >= per.desde; }).map(function (d) {
    var r = liq.porFecha[d.fecha] || {};
    return { fecha: d.fecha, entrada: d.entrada || '', salAlm: d.salAlm || '', entAlm: d.entAlm || '', salida: d.salida || '', min: r.trabajadoMin || 0, extra: r.extraCalculadaMin || 0, tarde: r.tardanzaMin || 0, incompleto: !!r.incompleto && d.fecha !== a.fecha };
  });
  return o;
}

/* ---------- Registro e ingreso ---------- */
function a_publico() { var c = cfg_(), o = { version: VERSION, hayAdmin: leer('Usuarios').some(function (u) { return u.rol === 'admin' && u.hash; }) }; CFG_PUBLICAS.forEach(function (k) { o[k] = c[k]; }); return o; }

function a_consultarCedula(d) {
  var ced = soloDigitos_(d.cedula); if (ced.length < 5) throw E_('DATOS', 'Escribe tu número de cédula completo.');
  limite_('ced:' + ced, 12, 600);
  var u = buscar('Usuarios', 'cedula', ced);
  // No se revela nombre ni datos: solo si ya tiene contraseña.
  return { existe: !!(u && u.hash), inactivo: !!(u && u.estado === 'inactivo') };
}

function a_registro(d) {
  var ced = soloDigitos_(d.cedula), c = cfg_(), a = ahora_();
  if (ced.length < 5 || ced.length > 12) throw E_('DATOS', 'La cédula no es válida.');
  limite_('reg:' + ced, 6, 900);
  var clave = String(d.clave || ''); if (clave.length < 6) throw E_('DATOS', 'La contraseña debe tener al menos 6 caracteres.');
  var cons = d.consentimiento || {};
  if (!cons.datos || !cons.sensibles) throw E_('CONSENTIMIENTO', 'Para usar la aplicación debes autorizar el tratamiento de tus datos.');
  var cod = txt_(d.codigo, 40), u = buscar('Usuarios', 'cedula', ced), salario = Math.max(0, Math.round(+d.salario || 0));
  if (u && u.hash) throw E_('EXISTE', 'Esta cédula ya tiene contraseña. Ingresa con ella.');
  if (u && u.estado === 'inactivo') throw E_('PERMISO', 'Tu usuario está inactivo. Habla con el administrador.');
  var salt = azar_().substr(0, 16), rol = 'trabajador', estado = 'activo', codAdmin = prop_('CODIGO_ADMIN');
  if (codAdmin && cod === codAdmin) { rol = 'admin'; prop_('CODIGO_ADMIN', null); }
  else if (u) { if (!u.codigo || u.codigo !== hmac_('act|' + ced + '|' + cod)) throw E_('CODIGO', 'El código de activación no coincide. Pídelo al administrador.'); rol = u.rol || 'trabajador'; }
  else {
    if (!c.autoRegistro) throw E_('CODIGO', 'Tu cédula aún no está cargada. Pide al administrador que te registre.');
    if (!c.codigoEmpresa || cod !== String(c.codigoEmpresa)) throw E_('CODIGO', 'El código de la empresa no coincide.');
    estado = 'pendiente';
  }
  var base = u || { cedula: ced, creado: a.iso, tipoPago: 'mensual' };
  base.nombre = base.nombre || txt_(d.nombre, 80); if (!base.nombre) throw E_('DATOS', 'Escribe tu nombre completo.');
  base.rol = rol; base.estado = estado; base.hash = hashClave_(clave, salt); base.salt = salt; base.codigo = '';
  if (base.salarioOk !== '1') { if (!salario) throw E_('DATOS', 'Escribe tu salario mensual.'); base.salario = salario; base.salarioOk = ''; }
  base.email = base.email || txt_(d.email, 120); base.telefono = base.telefono || soloDigitos_(d.telefono).substr(0, 15);
  base.cargo = base.cargo || txt_(d.cargo, 60); base.centroId = base.centroId || txt_(d.centroId, 20);
  base.consVersion = c.versionLegal; base.consFecha = a.iso;
  if (u) guardar('Usuarios', base); else agregar('Usuarios', base);
  auditar_(ced, 'registro', { rol: rol, estado: estado, consentimiento: c.versionLegal });
  if (estado === 'pendiente') alertar_('registro_nuevo', ced, 'Se registró con el código de la empresa y espera aprobación del administrador.');
  return { token: crearSesion_(ced, d.equipo), usuario: usuarioPublico_(base) };
}

function a_login(d) {
  var ced = soloDigitos_(d.cedula); limite_('login:' + ced, 8, 900);
  var u = buscar('Usuarios', 'cedula', ced);
  if (!u || !u.hash || u.hash !== hashClave_(String(d.clave || ''), u.salt)) throw E_('CREDENCIALES', 'La cédula o la contraseña no coinciden.');
  if (u.estado === 'inactivo') throw E_('PERMISO', 'Tu usuario está inactivo. Habla con el administrador.');
  CacheService.getScriptCache().remove('rl:login:' + ced);
  return { token: crearSesion_(ced, d.equipo), usuario: usuarioPublico_(u) };
}
function a_salir(d, u, req) { cerrarSesiones_(u.cedula, sha_(String(req.t))); return {}; }
function a_cambiarClave(d, u) {
  if (u.hash !== hashClave_(String(d.actual || ''), u.salt)) throw E_('CREDENCIALES', 'La contraseña actual no coincide.');
  if (String(d.nueva || '').length < 6) throw E_('DATOS', 'La contraseña nueva debe tener al menos 6 caracteres.');
  u.salt = azar_().substr(0, 16); u.hash = hashClave_(String(d.nueva), u.salt); guardar('Usuarios', u); auditar_(u.cedula, 'cambio_clave', ''); return {};
}
function a_consentir(d, u) {
  if (!d.datos || !d.sensibles) throw E_('CONSENTIMIENTO', 'Debes autorizar el tratamiento de datos para continuar.');
  u.consVersion = cfg_().versionLegal; u.consFecha = ahora_().iso; guardar('Usuarios', u); auditar_(u.cedula, 'consentimiento', u.consVersion); return { consVersion: u.consVersion };
}
function a_misDatos(d, u) {
  if (d.email !== undefined) u.email = txt_(d.email, 120);
  if (d.telefono !== undefined) u.telefono = soloDigitos_(d.telefono).substr(0, 15);
  if (d.salario !== undefined && u.salarioOk !== '1') u.salario = Math.max(0, Math.round(+d.salario || 0));
  guardar('Usuarios', u); return usuarioPublico_(u);
}

function a_yo(d, u) {
  var c = cfg_(), a = ahora_(), marc = leer('Marcaciones', 15000);
  if (u.rol === 'admin' && !c.urlApp && /^https:\/\//.test(d.base || '')) cfgSet_('urlApp', txt_(d.base, 200));
  var o = { usuario: usuarioPublico_(u), ahora: a.iso, version: VERSION,
    cfg: { empresa: c.empresa, versionLegal: c.versionLegal, recordatorioMin: c.recordatorioMin, periodoNomina: c.periodoNomina, diasAtrasManual: c.diasAtrasManual, geocercaEstricta: c.geocercaEstricta, horasLimitePermiso: c.horasLimitePermiso },
    centros: centros_().filter(function (x) { return x.activo; }).map(centroPub_), permisosCat: Motor.PERMISOS };
  if (u.estado !== 'activo') return o;
  o.hoy = estadoHoy_(u, marc); o.resumen = resumen_(u, marc);
  var tomadas = 0; leer('Permisos').forEach(function (p) { if (p.cedula === u.cedula && p.tipo === 'vacaciones' && p.estado === 'aprobado') tomadas += Motor.diasHabiles(p.fechaSalida, Motor.sumar(p.fechaRegreso, -1), legal_(), false); });
  o.vacaciones = { causadas: Motor.vacacionesCausadas(u.ingreso, a.fecha), tomadas: tomadas };
  return o;
}

/* ---------- Marcaciones ---------- */
function a_marcar(d, u) {
  if (u.estado !== 'activo') throw E_('PERMISO', 'Tu usuario aún no ha sido aprobado por el administrador.');
  var c = cfg_(), a = ahora_(), tipo = d.tipo, marc = leer('Marcaciones', 15000);
  if (TIPOS.indexOf(tipo) < 0) throw E_('DATOS', 'Tipo de marcación no válido.');
  var mid = txt_(d.id, 40) || id_();
  for (var i = marc.length - 1; i >= 0 && i > marc.length - 3000; i--) if (marc[i].id === mid) return { repetida: true, hoy: estadoHoy_(u, marc), resumen: resumen_(u, marc) }; // reintento seguro
  var lat = +d.lat, lng = +d.lng;
  if (d.lat === undefined || d.lat === null || d.lat === '' || isNaN(lat) || isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw E_('GPS_REQUERIDO', 'No se puede marcar sin ubicación. Activa el GPS y da permiso a la aplicación.');
  var manual = !!d.manual, offline = !!d.offline && !manual, hora = a.iso;
  if (manual || offline) {
    hora = String(d.hora || '').substr(0, 16);
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(hora)) throw E_('DATOS', 'La hora no es válida.');
    var dif = isoMs_(a.iso) - isoMs_(hora);
    if (dif < -5 * 60000) throw E_('DATOS', 'No se puede marcar una hora que aún no llega.');
    if (dif > (c.diasAtrasManual + 1) * 86400000) throw E_('DATOS', 'Solo puedes corregir marcaciones de los últimos ' + c.diasAtrasManual + ' días. Pide el ajuste al administrador.');
    if (manual && txt_(d.motivo, 200).length < 5) throw E_('DATOS', 'Explica brevemente por qué no marcaste a tiempo.');
  }
  // ¿A qué jornada pertenece?
  var fecha = /^\d{4}-\d\d-\d\d$/.test(d.fecha || '') && manual ? d.fecha : hora.substr(0, 10);
  var cerca = diasDe_(marc, u.cedula, Motor.sumar(fecha, -1), fecha), dia = null, prev = null;
  cerca.forEach(function (x) { if (x.fecha === fecha) dia = x; else prev = x; });
  if (tipo !== 'entrada' && !dia && prev && prev.entrada && !prev.salida && isoMs_(hora) - isoMs_(prev.fecha + 'T' + prev.entrada) < 16 * 3600000) { dia = prev; fecha = prev.fecha; }
  if (periodoCerrado_(fecha)) throw E_('CERRADO', 'Ese día ya pertenece a una nómina cerrada. Habla con el administrador.');
  var tiene = {}; if (dia) dia.marcas.forEach(function (m) { tiene[m.tipo] = m.hora; });
  if (tiene[tipo]) throw E_('DUPLICADA', 'Ya registraste "' + NOMBRE_TIPO[tipo] + '" en esta jornada (' + tiene[tipo].substr(11, 5) + ').');
  if (tipo !== 'entrada' && !tiene.entrada) throw E_('ORDEN', 'Primero registra tu entrada. Si se te olvidó, puedes digitar la hora en que llegaste.');
  tiene[tipo] = hora; var ant = null;
  TIPOS.forEach(function (t) { if (!tiene[t]) return; if (ant && isoMs_(tiene[t]) <= isoMs_(ant)) throw E_('ORDEN', 'La hora de "' + NOMBRE_TIPO[t] + '" debe ser posterior a la marcación anterior.'); ant = tiene[t]; });
  if (isoMs_(tiene[tipo]) - isoMs_(tiene.entrada) > 20 * 3600000) throw E_('ORDEN', 'La jornada no puede durar más de 20 horas. Revisa la hora.');
  // Centro y geocerca
  var centro = centroDe_(txt_(d.centroId, 20)) || centroDe_(u.centroId), dist = '', enZona = '';
  if (centro && centro.lat !== null && centro.lng !== null) {
    dist = distancia_(lat, lng, centro.lat, centro.lng); enZona = dist <= centro.radio + Math.min(+d.prec || 0, 100) ? '1' : '0';
    if (enZona === '0' && c.geocercaEstricta && !manual) throw E_('FUERA_ZONA', 'Estás a ' + dist + ' m de ' + centro.nombre + '. Acércate al centro de trabajo para marcar.');
  }
  // Foto aleatoria
  var exigida = !manual && fotoRequerida_(u.cedula, fecha, tipo), fotoId = '', estado = manual ? 'revisar' : 'ok';
  if (d.foto) fotoId = guardarImagen_(d.foto, u.cedula + '_' + hora.replace(/[:T]/g, '-') + '_' + tipo + '.jpg', 'CARPETA_FOTOS');
  else if (exigida) { if (!offline) throw E_('FOTO_REQUERIDA', 'Esta marcación pide una foto. Tómala para continuar.'); estado = 'revisar'; }
  var hor = (dia && dia.horario) || horarioDe_(centro, fecha);
  var fila = { id: mid, cedula: u.cedula, fecha: fecha, tipo: tipo, hora: hora, servidor: a.iso, lat: lat.toFixed(6), lng: lng.toFixed(6), prec: String(Math.round(+d.prec || 0)), dist: String(dist), enZona: enZona,
    centroId: centro ? centro.id : '', foto: fotoId, fotoExigida: exigida ? '1' : '', manual: manual ? '1' : '', motivo: manual ? txt_(d.motivo, 200) : '', estado: estado, horario: hor ? JSON.stringify(hor) : '', origen: manual ? 'manual' : offline ? 'sin_conexion' : 'en_linea', editadoPor: '' };
  agregar('Marcaciones', fila); fila._f = hoja_('Marcaciones').getLastRow(); marc.push(fila); _c['Marcaciones|15000'] = marc; // evita releer toda la hoja
  // Alertas
  if (tipo === 'entrada' && hor && Motor.aMin(hora.substr(11, 5)) > Motor.aMin(hor.e) + (+hor.tol || 0))
    alertar_('tardanza', u.cedula, 'Marcó entrada a las ' + hora.substr(11, 5) + ' (horario ' + hor.e + ')' + (centro ? ' en ' + centro.nombre : '') + '. Retraso: ' + (Motor.aMin(hora.substr(11, 5)) - Motor.aMin(hor.e)) + ' min.');
  if (enZona === '0') alertar_('fuera_zona', u.cedula, NOMBRE_TIPO[tipo] + ' a ' + dist + ' m de ' + centro.nombre + ' (radio permitido ' + centro.radio + ' m). https://maps.google.com/?q=' + lat.toFixed(6) + ',' + lng.toFixed(6));
  if (manual) alertar_('marcacion_manual', u.cedula, 'Digitó "' + NOMBRE_TIPO[tipo] + '" del ' + fecha + ' a las ' + hora.substr(11, 5) + '. Motivo: ' + txt_(d.motivo, 200));
  if (exigida && !fotoId) alertar_('sin_foto', u.cedula, NOMBRE_TIPO[tipo] + ' del ' + fecha + ' llegó sin la foto exigida (se registró sin conexión).');
  if (tipo === 'salida' || tiene.salida) recalcularExtras_(u.cedula, fecha, marc);
  return { hora: hora, fecha: fecha, enZona: enZona, dist: dist, hoy: estadoHoy_(u, marc), resumen: resumen_(u, marc) };
}

function a_bloqueo(d, u) {
  limite_('blq:' + u.cedula, 4, 3600);
  alertar_('bloqueo_permisos', u.cedula, (d.que === 'camara' ? 'Canceló o bloqueó la cámara' : 'Bloqueó o no activó la ubicación (GPS)') + ' al intentar marcar "' + (NOMBRE_TIPO[d.tipo] || '') + '". No pudo registrar la marcación.');
  return {};
}

function recalcularExtras_(cedula, fecha, marc) {
  var L = legal_(), lun = Motor.lunesDe(fecha), dom = Motor.sumar(lun, 6), liq = Motor.liquidarDias(diasDe_(marc || leer('Marcaciones', 15000), cedula, lun, dom), L, null), sem = 0;
  var filas = {}; leer('Extras').forEach(function (x) { if (x.cedula === cedula && x.fecha >= lun && x.fecha <= dom) filas[x.fecha] = x; });
  for (var f = lun; f <= dom; f = Motor.sumar(f, 1)) {
    var calc = liq[f] ? liq[f].extraCalculadaMin : 0, x = filas[f]; sem += calc;
    if (!x && calc >= 10) {
      agregar('Extras', { id: cedula + '|' + f, cedula: cedula, fecha: f, minCalc: calc, minAprob: '', estado: 'pendiente' });
      if (calc > L.maxExtraDiaH * 60) alertar_('extras_tope', cedula, 'El ' + f + ' registró ' + (Math.round(calc / 6) / 10) + ' h extra. El máximo legal es ' + L.maxExtraDiaH + ' h por día.');
    } else if (x && +x.minCalc !== calc && !periodoCerrado_(f)) {
      x.minCalc = calc;
      if (calc < 10) { x.estado = 'sin_extra'; x.minAprob = ''; }
      else if (x.estado !== 'pendiente') { x.estado = 'pendiente'; x.minAprob = ''; x.obs = 'Se recalculó tras un cambio en las marcaciones; requiere nueva aprobación.'; }
      guardar('Extras', x);
    }
  }
  if (sem > L.maxExtraSemanaH * 60) alertar_('extras_tope', cedula, 'En la semana del ' + lun + ' acumula ' + (Math.round(sem / 6) / 10) + ' h extra. El máximo legal es ' + L.maxExtraSemanaH + ' h por semana.');
}

function a_historial(d, u) {
  var a = ahora_(), desde = /^\d{4}-\d\d-\d\d$/.test(d.desde || '') ? d.desde : a.fecha.substr(0, 8) + '01', hasta = /^\d{4}-\d\d-\d\d$/.test(d.hasta || '') ? d.hasta : Motor.ultimoDia(desde);
  if (Motor.diasEntre(desde, hasta) > 62) throw E_('DATOS', 'Consulta máximo dos meses a la vez.');
  var dias = diasDe_(leer('Marcaciones'), u.cedula, Motor.lunesDe(desde), hasta), liq = Motor.liquidarDias(dias, legal_(), null);
  return dias.filter(function (x) { return x.fecha >= desde; }).map(function (x) {
    var r = liq[x.fecha];
    return { fecha: x.fecha, entrada: x.entrada || '', salAlm: x.salAlm || '', entAlm: x.entAlm || '', salida: x.salida || '', min: r.trabajadoMin, extra: r.extraCalculadaMin, tarde: r.tardanzaMin, incompleto: r.incompleto && x.fecha !== a.fecha,
      manual: x.marcas.some(function (m) { return m.manual; }), festivo: Motor.esFestivo(x.fecha, legal_()) };
  });
}

/* ---------- Permisos ---------- */
function jefes_() { return leer('Jefes').filter(function (j) { return j.activo !== '0'; }); }
function tokenFirma_(pid, jid) { return hmac_('firma|' + pid + '|' + jid).substr(0, 28); }
function enlaceFirma_(pid, jid) { return (cfg_().urlApp || '').replace(/[#?].*$/, '') + '#/firma/' + pid + '.' + jid + '.' + tokenFirma_(pid, jid); }
function permisoPub_(p, conEnlaces) {
  var firmas = json_(p.firmas, []), u = buscar('Usuarios', 'cedula', p.cedula), cat = Motor.PERMISOS.filter(function (x) { return x.id === p.tipo; })[0] || {};
  var o = { id: p.id, cedula: p.cedula, nombre: u ? u.nombre : '', cargo: u ? u.cargo : '', tipo: p.tipo, tipoNombre: cat.nombre || p.tipo, norma: cat.norma || '', cat: p.cat, remunerado: p.remunerado === '1',
    fechaSalida: p.fechaSalida, horaSalida: p.horaSalida, fechaRegreso: p.fechaRegreso, horaRegreso: p.horaRegreso, motivo: p.motivo, soporte: p.soporte, estado: p.estado, creado: p.creado, limite: p.limite,
    decididoPor: p.decididoPor, decididoEl: p.decididoEl, obs: p.obs,
    firmas: firmas.map(function (f) { return { id: f.id, nombre: f.nombre, cargo: f.cargo, estado: f.estado, fecha: f.fecha, obs: f.obs, firma: f.firma, whatsapp: conEnlaces ? f.whatsapp : undefined, enlace: conEnlaces && f.estado === 'pendiente' ? enlaceFirma_(p.id, f.id) : undefined }; }) };
  return o;
}
function a_permisoCrear(d, u) {
  if (u.estado !== 'activo') throw E_('PERMISO', 'Tu usuario aún no ha sido aprobado.');
  var c = cfg_(), a = ahora_(), cat = Motor.PERMISOS.filter(function (x) { return x.id === d.tipo; })[0];
  if (!cat) throw E_('DATOS', 'Elige el tipo de permiso.');
  var re = /^\d{4}-\d\d-\d\d$/, rh = /^\d\d:\d\d$/;
  if (!re.test(d.fechaSalida || '') || !re.test(d.fechaRegreso || '')) throw E_('DATOS', 'Completa la fecha de salida y la de regreso.');
  if (d.fechaRegreso < d.fechaSalida) throw E_('DATOS', 'El regreso no puede ser antes de la salida.');
  var hs = rh.test(d.horaSalida || '') ? d.horaSalida : '', hr = rh.test(d.horaRegreso || '') ? d.horaRegreso : '';
  if (d.fechaSalida === d.fechaRegreso) { if (!hs || !hr) throw E_('DATOS', 'Para un permiso dentro del mismo día indica hora de salida y de regreso.'); if (hr <= hs) throw E_('DATOS', 'La hora de regreso debe ser posterior a la de salida.'); }
  if (txt_(d.motivo, 500).length < 5) throw E_('DATOS', 'Escribe el motivo del permiso.');
  if (cat.cat !== 'calamidad' && d.fechaSalida < Motor.sumar(a.fecha, -c.diasAtrasManual)) throw E_('DATOS', 'La fecha de salida es demasiado antigua.');
  limite_('perm:' + u.cedula, 10, 3600);
  var pid = id_(), centro = u.centroId;
  var firmas = jefes_().filter(function (j) { var cs = json_(j.centros, []); return !cs.length || cs.indexOf(centro) >= 0; })
    .map(function (j) { return { id: j.id, nombre: j.nombre, cargo: j.cargo, whatsapp: j.whatsapp, estado: 'pendiente', fecha: '', obs: '', firma: '' }; });
  var p = { id: pid, cedula: u.cedula, tipo: cat.id, cat: cat.cat, remunerado: cat.rem ? '1' : '', fechaSalida: d.fechaSalida, horaSalida: hs, fechaRegreso: d.fechaRegreso, horaRegreso: hr, motivo: txt_(d.motivo, 500),
    soporte: d.soporte ? guardarImagen_(d.soporte, 'soporte_' + u.cedula + '_' + pid + '.jpg', 'CARPETA_FOTOS') : '', estado: firmas.length ? 'en_firmas' : 'firmado', creado: a.iso,
    limite: String(a.ms + c.horasLimitePermiso * 3600000), firmas: JSON.stringify(firmas), decididoPor: '', decididoEl: '', obs: '' };
  agregar('Permisos', p);
  var resumen = cat.nombre + '\nSale: ' + p.fechaSalida + ' ' + hs + '\nRegresa: ' + p.fechaRegreso + ' ' + hr + '\nMotivo: ' + p.motivo;
  jefes_().forEach(function (j) { if (j.email && firmas.some(function (f) { return f.id === j.id; })) correo_(j.email, 'Permiso por firmar: ' + u.nombre, u.nombre + ' (C.C. ' + u.cedula + ') solicita:\n' + resumen + '\n\nFirma o rechaza aquí (necesitas tu clave de firma):\n' + enlaceFirma_(pid, j.id)); });
  alertar_('permiso_nuevo', u.cedula, resumen);
  return permisoPub_(p, true);
}
function a_permisosMios(d, u) { return leer('Permisos').filter(function (p) { return p.cedula === u.cedula; }).reverse().slice(0, 60).map(function (p) { return permisoPub_(p, p.estado === 'en_firmas'); }); }
function a_permisoCancelar(d, u) {
  var p = buscar('Permisos', 'id', d.id); if (!p || p.cedula !== u.cedula) throw E_('DATOS', 'No se encontró el permiso.');
  if (['en_firmas', 'firmado', 'vencido'].indexOf(p.estado) < 0) throw E_('DATOS', 'Este permiso ya fue resuelto y no se puede cancelar.');
  p.estado = 'cancelado'; guardar('Permisos', p); auditar_(u.cedula, 'permiso_cancelado', p.id); return {};
}
function firmaValida_(d) {
  var pid = txt_(d.p, 20), jid = txt_(d.j, 20);
  if (!pid || !jid || String(d.k) !== tokenFirma_(pid, jid)) throw E_('ENLACE', 'El enlace de firma no es válido.');
  var p = buscar('Permisos', 'id', pid); if (!p) throw E_('ENLACE', 'El permiso ya no existe.');
  return p;
}
function a_firmaVer(d) {
  limite_('fv:' + txt_(d.p, 20), 60, 600);
  var p = firmaValida_(d), o = permisoPub_(p, false); o.jefeId = d.j; o.soporte = o.soporte ? '1' : '';
  o.firmas.forEach(function (f) { delete f.firma; }); o.empresa = cfg_().empresa; return o;
}
function a_firmaResponder(d) {
  var p = firmaValida_(d), jid = txt_(d.j, 20), a = ahora_();
  limite_('fr:' + p.id + jid, 6, 900); // la clave de firma no se puede adivinar a fuerza bruta
  var j = buscar('Jefes', 'id', jid);
  if (!j || j.activo === '0' || !j.pin || j.pin !== hmac_('pin|' + jid + '|' + String(d.pin || ''))) throw E_('CREDENCIALES', 'La clave de firma no coincide.');
  if (p.estado !== 'en_firmas') throw E_('DATOS', 'Este permiso ya no está esperando firmas (estado: ' + p.estado + ').');
  var firmas = json_(p.firmas, []), f = firmas.filter(function (x) { return x.id === jid; })[0];
  if (!f) throw E_('ENLACE', 'No estás en la lista de firmantes de este permiso.');
  if (f.estado !== 'pendiente') throw E_('DATOS', 'Ya respondiste este permiso.');
  var aprueba = d.decision === 'aprobar';
  if (!aprueba && txt_(d.obs, 300).length < 5) throw E_('DATOS', 'Explica por qué lo rechazas.');
  if (aprueba && !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]{200,30000}$/.test(d.firma || '')) throw E_('DATOS', 'Dibuja tu firma para aprobar.');
  f.estado = aprueba ? 'aprobado' : 'rechazado'; f.fecha = a.iso; f.obs = txt_(d.obs, 300); f.firma = aprueba ? d.firma : '';
  p.firmas = JSON.stringify(firmas);
  var c = cfg_(), u = buscar('Usuarios', 'cedula', p.cedula);
  if (!aprueba) { p.estado = 'rechazado'; p.obs = 'Rechazado por ' + f.nombre + ': ' + f.obs; }
  else if (firmas.every(function (x) { return x.estado === 'aprobado'; })) {
    p.estado = c.aprobacionFinalAdmin ? 'firmado' : 'aprobado';
    if (!c.aprobacionFinalAdmin) { p.decididoPor = 'firmas completas'; p.decididoEl = a.iso; }
  }
  guardar('Permisos', p); auditar_('jefe:' + jid, 'firma_permiso', { permiso: p.id, decision: f.estado });
  if (j.email) correo_(j.email, 'Constancia de tu respuesta', 'Se registró tu respuesta (' + f.estado + ') al permiso de ' + (u ? u.nombre : p.cedula) + ' el ' + a.iso.replace('T', ' ') + '.\nSi no fuiste tú, avisa de inmediato al administrador.');
  if (p.estado !== 'en_firmas') {
    alertar_('permiso_resuelto', p.cedula, 'Permiso del ' + p.fechaSalida + ': ' + (p.estado === 'firmado' ? 'todas las firmas completas, falta la aprobación final del administrador.' : p.estado + '. ' + p.obs));
    if (u && u.email) correo_(u.email, 'Tu permiso: ' + p.estado, 'Tu permiso del ' + p.fechaSalida + ' quedó en estado: ' + p.estado + '.\n' + p.obs);
  }
  return { estado: p.estado, miEstado: f.estado };
}

function a_desprendibles(d, u) {
  return leer('Nomina').filter(function (n) { return n.cedula === u.cedula; }).reverse().slice(0, 36).map(function (n) { return { id: n.id, desde: n.desde, hasta: n.hasta, neto: +n.neto, generado: n.generado, detalle: json_(n.detalle, {}) }; });
}
function a_error(d, u, req) {
  limite_('err', 120, 3600);
  registrarError_('cliente', { message: txt_(d.mensaje, 400), stack: txt_(d.detalle, 1500) }, { cedula: soloDigitos_(d.cedula), equipo: d.equipo, version: txt_(d.version, 20) });
  return {};
}

/* =====================  ADMINISTRACIÓN  ===================== */
function a_adminTablero() {
  var a = ahora_(), L = legal_(), marc = leer('Marcaciones', 15000), ahoraMin = Motor.aMin(a.hora), filas = [], cuenta = { presente: 0, almuerzo: 0, salio: 0, ausente: 0, por_llegar: 0, permiso: 0, incapacidad: 0, descanso: 0, tarde: 0 };
  var incs = leer('Incapacidades'), cs = {}; centros_().forEach(function (c) { cs[c.id] = c; });
  leer('Usuarios').forEach(function (u) {
    if (u.estado !== 'activo') return;
    var centro = cs[u.centroId], hor = horarioDe_(centro, a.fecha), d = diasDe_(marc, u.cedula, a.fecha, a.fecha)[0], est, tarde = 0;
    if (incs.some(function (i) { return i.cedula === u.cedula && i.desde <= a.fecha && a.fecha <= i.hasta; })) est = 'incapacidad';
    else if (d && d.salida) est = 'salio'; else if (d && d.salAlm && !d.entAlm) est = 'almuerzo'; else if (d && d.entrada) est = 'presente';
    else {
      var per = permisosAprobados_(u.cedula).filter(function (p) { return p.desde <= a.fecha && a.fecha <= p.hasta && !p.horas; })[0];
      est = per ? 'permiso' : !hor ? 'descanso' : ahoraMin < Motor.aMin(hor.e) + (+hor.tol || 0) ? 'por_llegar' : 'ausente';
    }
    if (d && d.entrada && d.horario && Motor.aMin(d.entrada) > Motor.aMin(d.horario.e) + (+d.horario.tol || 0)) { tarde = Motor.aMin(d.entrada) - Motor.aMin(d.horario.e); cuenta.tarde++; }
    cuenta[est]++;
    filas.push({ cedula: u.cedula, nombre: u.nombre, cargo: u.cargo, centro: centro ? centro.nombre : 'Sin centro', estado: est, entrada: d ? d.entrada || '' : '', salida: d ? d.salida || '' : '', tarde: tarde,
      fueraZona: !!(d && d.marcas.some(function (m) { return m.enZona === '0'; })) });
  });
  return { fecha: a.fecha, hora: a.hora, festivo: Motor.esFestivo(a.fecha, L), cuenta: cuenta, personas: filas,
    pendientes: { permisos: leer('Permisos').filter(function (p) { return p.estado === 'firmado' || p.estado === 'vencido'; }).length,
      enFirmas: leer('Permisos').filter(function (p) { return p.estado === 'en_firmas'; }).length,
      extras: leer('Extras').filter(function (x) { return x.estado === 'pendiente'; }).length,
      revisar: marc.filter(function (m) { return m.estado === 'revisar'; }).length,
      usuarios: leer('Usuarios').filter(function (u) { return u.estado === 'pendiente'; }).length,
      salarios: leer('Usuarios').filter(function (u) { return u.estado === 'activo' && u.salarioOk !== '1'; }).length } };
}

function a_adminPersonal() { return leer('Usuarios').map(usuarioPublico_); }
function a_adminPersonaGuardar(d, adm) {
  var ced = soloDigitos_(d.cedula); if (ced.length < 5 || ced.length > 12) throw E_('DATOS', 'La cédula no es válida.');
  var u = buscar('Usuarios', 'cedula', ced), nuevo = !u, cod = null;
  if (nuevo) { u = { cedula: ced, creado: ahora_().iso, estado: 'preregistrado', hash: '', salt: '' }; cod = codigo6_(); u.codigo = hmac_('act|' + ced + '|' + cod); }
  if (!txt_(d.nombre, 80)) throw E_('DATOS', 'Escribe el nombre.');
  u.nombre = txt_(d.nombre, 80); u.cargo = txt_(d.cargo, 60); u.rol = d.rol === 'admin' ? 'admin' : 'trabajador'; u.centroId = txt_(d.centroId, 20);
  u.salario = Math.max(0, Math.round(+d.salario || 0)); u.salarioOk = u.salario ? '1' : ''; u.tipoPago = d.tipoPago === 'dia' ? 'dia' : 'mensual';
  u.email = txt_(d.email, 120); u.telefono = soloDigitos_(d.telefono).substr(0, 15); u.ingreso = /^\d{4}-\d\d-\d\d$/.test(d.ingreso || '') ? d.ingreso : ''; u.eps = txt_(d.eps, 60); u.arl = txt_(d.arl, 60);
  if (!nuevo && d.estado && ['activo', 'inactivo'].indexOf(d.estado) >= 0 && u.hash) {
    if (u.cedula === adm.cedula && d.estado === 'inactivo') throw E_('DATOS', 'No puedes desactivar tu propio usuario.');
    u.estado = d.estado; if (d.estado === 'inactivo') cerrarSesiones_(ced); // la baja revoca el acceso de inmediato
  }
  if (!nuevo && u.cedula === adm.cedula && u.rol !== 'admin') throw E_('DATOS', 'No puedes quitarte el rol de administrador.');
  if (nuevo) agregar('Usuarios', u); else guardar('Usuarios', u);
  auditar_(adm.cedula, nuevo ? 'persona_creada' : 'persona_editada', { cedula: ced, estado: u.estado, rol: u.rol, salario: u.salario });
  return { usuario: usuarioPublico_(u), codigo: cod };
}
function a_adminPersonaCodigo(d, adm) { // nuevo código de activación (también sirve para restablecer la contraseña)
  var u = buscar('Usuarios', 'cedula', soloDigitos_(d.cedula)); if (!u) throw E_('DATOS', 'No se encontró la persona.');
  var cod = codigo6_(); u.codigo = hmac_('act|' + u.cedula + '|' + cod); u.hash = ''; u.salt = ''; if (u.estado !== 'inactivo') u.estado = 'preregistrado';
  guardar('Usuarios', u); cerrarSesiones_(u.cedula); auditar_(adm.cedula, 'codigo_activacion', u.cedula); return { codigo: cod };
}
function a_adminPersonaImportar(d, adm) {
  var filas = d.filas || [], res = []; if (filas.length > 300) throw E_('DATOS', 'Importa máximo 300 personas por archivo.');
  filas.forEach(function (f) {
    try { var ced = soloDigitos_(f.cedula); if (buscar('Usuarios', 'cedula', ced)) { res.push({ cedula: ced, nombre: f.nombre, resultado: 'Ya existía, no se modificó', codigo: '' }); return; }
      var r = a_adminPersonaGuardar(f, adm); res.push({ cedula: ced, nombre: r.usuario.nombre, resultado: 'Creada', codigo: r.codigo });
    } catch (e) { res.push({ cedula: f.cedula, nombre: f.nombre, resultado: 'Error: ' + e.message, codigo: '' }); }
  });
  return res;
}

function a_adminCentros() { return centros_().map(centroPub_); }
function a_adminCentroGuardar(d, adm) {
  var c = d.id ? buscar('Centros', 'id', d.id) : null, nuevo = !c; if (nuevo) c = { id: id_().substr(0, 8) };
  if (!txt_(d.nombre, 80)) throw E_('DATOS', 'Escribe el nombre del centro de trabajo.');
  var hor = {}, rh = /^\d\d:\d\d$/;
  for (var w = 0; w < 7; w++) { var h = (d.horario || {})[w]; if (h && rh.test(h.e || '') && rh.test(h.s || '')) hor[w] = { e: h.e, s: h.s, ai: rh.test(h.ai || '') && rh.test(h.af || '') ? h.ai : '', af: rh.test(h.ai || '') && rh.test(h.af || '') ? h.af : '' }; }
  c.nombre = txt_(d.nombre, 80); c.cliente = txt_(d.cliente, 80); c.direccion = txt_(d.direccion, 160);
  c.lat = d.lat === '' || d.lat === null || isNaN(+d.lat) ? '' : (+d.lat).toFixed(6); c.lng = d.lng === '' || d.lng === null || isNaN(+d.lng) ? '' : (+d.lng).toFixed(6);
  c.radio = Math.max(20, Math.round(+d.radio || cfg_().radioDefecto)); c.horario = JSON.stringify(hor); c.tol = d.tol === '' || d.tol === undefined ? '' : Math.max(0, Math.round(+d.tol));
  c.festivos = d.festivos ? '1' : ''; c.activo = d.activo === false ? '0' : '1';
  if (nuevo) agregar('Centros', c); else guardar('Centros', c);
  // El horario nuevo aplica desde hoy: cada día ya fichado conserva la foto del horario con que se trabajó.
  auditar_(adm.cedula, nuevo ? 'centro_creado' : 'centro_editado', { id: c.id, nombre: c.nombre, horario: hor });
  return centroPub_(centroDe_(c.id));
}

function rango_(d, maxDias) {
  var a = ahora_(), re = /^\d{4}-\d\d-\d\d$/, desde = re.test(d.desde || '') ? d.desde : a.fecha, hasta = re.test(d.hasta || '') ? d.hasta : desde;
  if (hasta < desde) throw E_('DATOS', 'El rango de fechas no es válido.');
  if (Motor.diasEntre(desde, hasta) > (maxDias || 62)) throw E_('DATOS', 'Consulta máximo ' + (maxDias || 62) + ' días a la vez.');
  return { desde: desde, hasta: hasta, hoy: a.fecha };
}
function a_adminMarcaciones(d) {
  var r = rango_(d), marc = leer('Marcaciones'), L = legal_(), nombres = {}, cs = {}, out = [];
  leer('Usuarios').forEach(function (u) { nombres[u.cedula] = u.nombre; }); centros_().forEach(function (c) { cs[c.id] = c.nombre; });
  Object.keys(nombres).forEach(function (ced) {
    if (d.cedula && d.cedula !== ced) return;
    var dias = diasDe_(marc, ced, Motor.lunesDe(r.desde), r.hasta), liq = Motor.liquidarDias(dias, L, null);
    dias.forEach(function (x) {
      if (x.fecha < r.desde || (d.centroId && x.centroId !== d.centroId)) return; var q = liq[x.fecha];
      out.push({ cedula: ced, nombre: nombres[ced], fecha: x.fecha, centro: cs[x.centroId] || '', entrada: x.entrada || '', salAlm: x.salAlm || '', entAlm: x.entAlm || '', salida: x.salida || '',
        min: q.trabajadoMin, extra: q.extraCalculadaMin, tarde: q.tardanzaMin, incompleto: q.incompleto && x.fecha !== r.hoy, almuerzoAsumido: q.almuerzoAsumido, marcas: x.marcas, cerrado: periodoCerrado_(x.fecha) });
    });
  });
  return out.sort(function (a, b) { return a.fecha === b.fecha ? (a.nombre < b.nombre ? -1 : 1) : (a.fecha < b.fecha ? 1 : -1); });
}
function a_adminMarcacionGuardar(d, adm) { // el administrador corrige, agrega o anula una marcación; siempre queda en auditoría
  var re = /^\d{4}-\d\d-\d\d$/, ced = soloDigitos_(d.cedula);
  if (!re.test(d.fecha || '') || TIPOS.indexOf(d.tipo) < 0) throw E_('DATOS', 'Datos incompletos.');
  if (periodoCerrado_(d.fecha)) throw E_('CERRADO', 'Ese día pertenece a una nómina cerrada y ya no se puede modificar.');
  if (txt_(d.motivo, 200).length < 5) throw E_('DATOS', 'Escribe el motivo del ajuste.');
  var u = buscar('Usuarios', 'cedula', ced); if (!u) throw E_('DATOS', 'No se encontró la persona.');
  var marc = leer('Marcaciones'), act = null;
  marc.forEach(function (m) { if (m.cedula === ced && m.fecha === d.fecha && m.tipo === d.tipo && m.estado !== 'anulada') act = m; });
  var antes = act ? act.hora : '';
  if (d.anular) { if (!act) throw E_('DATOS', 'No hay marcación para anular.'); act.estado = 'anulada'; act.editadoPor = adm.cedula; act.motivo = txt_(d.motivo, 200); guardar('Marcaciones', act); }
  else {
    if (!/^\d\d:\d\d$/.test(d.hora || '')) throw E_('DATOS', 'La hora no es válida.');
    var dia = diasDe_(marc, ced, d.fecha, d.fecha)[0], ent = d.tipo === 'entrada' ? d.hora : dia && dia.entrada;
    var hora = (ent && d.tipo !== 'entrada' && d.hora < ent ? Motor.sumar(d.fecha, 1) : d.fecha) + 'T' + d.hora;
    if (act) { act.hora = hora; act.estado = 'ok'; act.editadoPor = adm.cedula; act.motivo = txt_(d.motivo, 200); guardar('Marcaciones', act); }
    else { var centro = centroDe_(u.centroId), hor = (dia && dia.horario) || horarioDe_(centro, d.fecha);
      agregar('Marcaciones', { id: id_(), cedula: ced, fecha: d.fecha, tipo: d.tipo, hora: hora, servidor: ahora_().iso, centroId: centro ? centro.id : '', manual: '1', motivo: txt_(d.motivo, 200), estado: 'ok', horario: hor ? JSON.stringify(hor) : '', origen: 'administrador', editadoPor: adm.cedula }); }
  }
  auditar_(adm.cedula, d.anular ? 'marcacion_anulada' : 'marcacion_ajustada', { cedula: ced, fecha: d.fecha, tipo: d.tipo, antes: antes, despues: d.anular ? '' : d.hora, motivo: d.motivo });
  recalcularExtras_(ced, d.fecha); return {};
}
function a_adminMarcacionRevisada(d, adm) {
  var m = buscar('Marcaciones', 'id', d.id); if (!m) throw E_('DATOS', 'No se encontró la marcación.');
  m.estado = 'ok'; m.editadoPor = adm.cedula; guardar('Marcaciones', m); auditar_(adm.cedula, 'marcacion_revisada', m.id); return {};
}
function a_adminFoto(d) {
  var id = txt_(d.id, 80), ok = leer('Marcaciones').some(function (m) { return m.foto === id; }) || leer('Permisos').some(function (p) { return p.soporte === id; }) || leer('Incapacidades').some(function (i) { return i.soporte === id; });
  if (!id || !ok) throw E_('DATOS', 'La foto ya no está disponible.');
  try { var b = DriveApp.getFileById(id).getBlob(); return { url: 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes()) }; }
  catch (e) { throw E_('DATOS', 'La foto fue eliminada por la política de retención.'); }
}

function a_adminPermisos() { return leer('Permisos').reverse().slice(0, 300).map(function (p) { return permisoPub_(p, true); }); }
function a_adminPermisoDecidir(d, adm) {
  var p = buscar('Permisos', 'id', d.id); if (!p) throw E_('DATOS', 'No se encontró el permiso.');
  if (['firmado', 'en_firmas', 'vencido'].indexOf(p.estado) < 0) throw E_('DATOS', 'Este permiso ya fue resuelto.');
  if (periodoCerrado_(p.fechaSalida)) throw E_('CERRADO', 'La fecha del permiso pertenece a una nómina cerrada.');
  var aprueba = d.decision === 'aprobar';
  if ((p.estado !== 'firmado' || !aprueba) && txt_(d.obs, 300).length < 5) throw E_('DATOS', p.estado !== 'firmado' ? 'Faltan firmas. Para decidir sin ellas escribe la justificación.' : 'Escribe el motivo del rechazo.');
  p.estado = aprueba ? 'aprobado' : 'rechazado'; p.decididoPor = adm.cedula; p.decididoEl = ahora_().iso; p.obs = txt_(d.obs, 300);
  if (d.remunerado !== undefined && p.cat !== 'ley' && p.cat !== 'vacaciones') p.remunerado = d.remunerado ? '1' : '';
  guardar('Permisos', p); auditar_(adm.cedula, 'permiso_' + p.estado, { id: p.id, cedula: p.cedula, obs: p.obs });
  var u = buscar('Usuarios', 'cedula', p.cedula);
  if (u && u.email) correo_(u.email, 'Tu permiso fue ' + p.estado, 'Tu permiso del ' + p.fechaSalida + ' fue ' + p.estado + ' por la administración.' + (p.obs ? '\nObservación: ' + p.obs : ''));
  return permisoPub_(p, true);
}

function a_adminIncapacidades() {
  var n = {}; leer('Usuarios').forEach(function (u) { n[u.cedula] = u.nombre; });
  return leer('Incapacidades').reverse().map(function (i) { return { id: i.id, cedula: i.cedula, nombre: n[i.cedula] || '', tipo: i.tipo, desde: i.desde, hasta: i.hasta, dias: Motor.diasEntre(i.desde, i.hasta) + 1, entidad: i.entidad, nota: i.nota, soporte: i.soporte, creado: i.creado }; });
}
function a_adminIncapacidadGuardar(d, adm) {
  var re = /^\d{4}-\d\d-\d\d$/, ced = soloDigitos_(d.cedula);
  if (!buscar('Usuarios', 'cedula', ced)) throw E_('DATOS', 'Elige la persona.');
  if (!re.test(d.desde || '') || !re.test(d.hasta || '') || d.hasta < d.desde) throw E_('DATOS', 'Revisa las fechas de la incapacidad.');
  if (['general', 'laboral', 'maternidad', 'paternidad'].indexOf(d.tipo) < 0) throw E_('DATOS', 'Elige el tipo de incapacidad.');
  if (periodoCerrado_(d.desde)) throw E_('CERRADO', 'La fecha pertenece a una nómina cerrada.');
  if (d.borrar) { var x = buscar('Incapacidades', 'id', d.id); if (x) { borrar('Incapacidades', x); auditar_(adm.cedula, 'incapacidad_borrada', { cedula: ced, desde: x.desde }); } return {}; }
  // Por minimización de datos (Ley 1581) NO se guarda el diagnóstico: solo fechas, tipo y entidad.
  var i = { id: id_(), cedula: ced, tipo: d.tipo, desde: d.desde, hasta: d.hasta, entidad: txt_(d.entidad, 80), nota: txt_(d.nota, 200),
    soporte: d.soporte ? guardarImagen_(d.soporte, 'incapacidad_' + ced + '_' + d.desde + '.jpg', 'CARPETA_FOTOS') : '', registradoPor: adm.cedula, creado: ahora_().iso };
  agregar('Incapacidades', i); auditar_(adm.cedula, 'incapacidad_creada', { cedula: ced, desde: i.desde, hasta: i.hasta, tipo: i.tipo }); return {};
}

function a_adminExtras(d) {
  var n = {}, L = legal_(), porSem = {}; leer('Usuarios').forEach(function (u) { n[u.cedula] = u.nombre; });
  var l = leer('Extras').filter(function (x) { return x.estado !== 'sin_extra' && (!d.estado || x.estado === d.estado); });
  l.forEach(function (x) { var k = x.cedula + Motor.lunesDe(x.fecha); porSem[k] = (porSem[k] || 0) + (+x.minCalc || 0); });
  return l.reverse().slice(0, 500).map(function (x) {
    return { id: x.id, cedula: x.cedula, nombre: n[x.cedula] || '', fecha: x.fecha, minCalc: +x.minCalc, minAprob: x.minAprob === '' ? null : +x.minAprob, estado: x.estado, obs: x.obs, decididoPor: x.decididoPor,
      superaDia: +x.minCalc > L.maxExtraDiaH * 60, superaSemana: porSem[x.cedula + Motor.lunesDe(x.fecha)] > L.maxExtraSemanaH * 60, cerrado: periodoCerrado_(x.fecha) };
  });
}
function a_adminExtraDecidir(d, adm) {
  var x = buscar('Extras', 'id', d.id); if (!x) throw E_('DATOS', 'No se encontró el registro.');
  if (periodoCerrado_(x.fecha)) throw E_('CERRADO', 'Ese día pertenece a una nómina cerrada.');
  var L = legal_(), min = d.decision === 'aprobar' ? Math.round(+d.min) : 0;
  if (d.decision === 'aprobar') {
    if (!(min > 0) || min > +x.minCalc) throw E_('DATOS', 'Los minutos aprobados deben estar entre 1 y ' + x.minCalc + '.');
    if (min > L.maxExtraDiaH * 60 && !d.confirmaTope) throw E_('TOPE', 'Vas a aprobar más de ' + L.maxExtraDiaH + ' horas extra en un día, por encima del máximo legal. Confirma si cuentas con autorización del Ministerio del Trabajo.');
  }
  x.estado = d.decision === 'aprobar' ? 'aprobada' : 'rechazada'; x.minAprob = min; x.decididoPor = adm.cedula; x.decididoEl = ahora_().iso; x.obs = txt_(d.obs, 200) + (d.confirmaTope ? ' [Aprobado por encima del tope legal]' : '');
  guardar('Extras', x); auditar_(adm.cedula, 'extra_' + x.estado, { cedula: x.cedula, fecha: x.fecha, min: min, tope: !!d.confirmaTope }); return {};
}

/* ---------- Nómina ---------- */
function liquidarTodos_(desde, hasta, corte) {
  var marc = leer('Marcaciones'), L = legal_(), cs = {}; centros_().forEach(function (c) { cs[c.id] = c.nombre; });
  return leer('Usuarios').filter(function (u) { return (u.estado === 'activo' || (u.estado === 'inactivo' && u.hash)) && +u.salario > 0; }).map(function (u) {
    var liq = Motor.liquidarPeriodo(insumos_(u, desde, hasta, corte, marc), L);
    return { cedula: u.cedula, nombre: u.nombre, cargo: u.cargo, centroId: u.centroId, centro: cs[u.centroId] || '', salario: +u.salario, salarioOk: u.salarioOk === '1', tipoPago: u.tipoPago || 'mensual', estado: u.estado, liq: liq };
  }).filter(function (x) { return x.estado === 'activo' || x.liq.diasTrabajados > 0; });
}
function a_adminNominaPrevia(d) {
  var r = rango_(d, 31), corte = r.hasta < r.hoy ? r.hasta : r.hoy;
  return { desde: r.desde, hasta: r.hasta, corte: corte, cerrado: periodoCerrado_(r.desde) || periodoCerrado_(r.hasta),
    extrasPendientes: leer('Extras').filter(function (x) { return x.estado === 'pendiente' && x.fecha >= r.desde && x.fecha <= r.hasta; }).length,
    permisosPendientes: leer('Permisos').filter(function (p) { return ['en_firmas', 'firmado', 'vencido'].indexOf(p.estado) >= 0 && p.fechaSalida <= r.hasta && p.fechaRegreso >= r.desde; }).length,
    filas: liquidarTodos_(r.desde, r.hasta, corte).map(function (x) { x.liq = sinDetalle_(x.liq); return x; }) };
}
function a_adminNominaCerrar(d, adm) {
  var r = rango_(d, 31), a = ahora_(), c = cfg_();
  if (r.hasta > r.hoy) throw E_('DATOS', 'El periodo aún no termina. Podrás cerrarlo desde el ' + Motor.sumar(r.hasta, 1) + '.');
  if (leer('Periodos').some(function (p) { return p.desde <= r.hasta && r.desde <= p.hasta; })) throw E_('CERRADO', 'Ya existe una nómina cerrada que cubre esas fechas.');
  var filas = liquidarTodos_(r.desde, r.hasta, r.hasta);
  filas.forEach(function (x) {
    var det = sinDetalle_(x.liq); det.empresa = { nombre: c.empresa.nombre, nit: c.empresa.nit }; det.persona = { nombre: x.nombre, cedula: x.cedula, cargo: x.cargo, centro: x.centro, salario: x.salario, tipoPago: x.tipoPago };
    agregar('Nomina', { id: r.desde + '|' + r.hasta + '|' + x.cedula, desde: r.desde, hasta: r.hasta, cedula: x.cedula, nombre: x.nombre, neto: x.liq.neto, detalle: JSON.stringify(det), generado: a.iso });
  });
  agregar('Periodos', { desde: r.desde, hasta: r.hasta, cerradoPor: adm.cedula, cerradoEl: a.iso });
  auditar_(adm.cedula, 'nomina_cerrada', { desde: r.desde, hasta: r.hasta, personas: filas.length, total: filas.reduce(function (s, x) { return s + x.liq.neto; }, 0) });
  return { personas: filas.length };
}
function a_adminNominas() {
  var tot = {}; leer('Nomina').forEach(function (n) { var k = n.desde + '|' + n.hasta; tot[k] = tot[k] || { n: 0, neto: 0 }; tot[k].n++; tot[k].neto += +n.neto; });
  return leer('Periodos').reverse().map(function (p) { var t = tot[p.desde + '|' + p.hasta] || { n: 0, neto: 0 }; return { desde: p.desde, hasta: p.hasta, cerradoPor: p.cerradoPor, cerradoEl: p.cerradoEl, personas: t.n, neto: t.neto }; });
}
function a_adminNominaDetalle(d) {
  return leer('Nomina').filter(function (n) { return n.desde === d.desde && n.hasta === d.hasta; }).map(function (n) { return { id: n.id, desde: n.desde, hasta: n.hasta, cedula: n.cedula, nombre: n.nombre, neto: +n.neto, generado: n.generado, detalle: json_(n.detalle, {}) }; });
}

function a_adminResumenObra(d) {
  var r = rango_(d, 62), corte = r.hasta < r.hoy ? r.hasta : r.hoy, marc = leer('Marcaciones'), L = legal_(), obras = {};
  function ob(id, nombre) { return obras[id] || (obras[id] = { centroId: id, centro: nombre, personas: 0, horas: 0, extras: 0, tardanzas: 0, ausencias: 0, costo: 0, dias: 0 }); }
  var cs = {}; centros_().forEach(function (c) { cs[c.id] = c.nombre; });
  liquidarTodos_(r.desde, r.hasta, corte).forEach(function (x) {
    var o = ob(x.centroId || '-', x.centro || 'Sin centro asignado'); o.personas++; o.ausencias += x.liq.ausencias; o.costo += x.liq.devengado;
    var porCentro = {}; diasDe_(marc, x.cedula, r.desde, r.hasta).forEach(function (dd) { porCentro[dd.fecha] = dd.centroId; });
    Object.keys(x.liq.porFecha).forEach(function (f) {
      var q = x.liq.porFecha[f], cid = porCentro[f] || x.centroId || '-', t = ob(cid, cs[cid] || 'Sin centro asignado');
      t.horas += q.trabajadoMin / 60; t.extras += q.extraCalculadaMin / 60; if (q.tardanzaMin) t.tardanzas++; if (q.trabajadoMin) t.dias++;
    });
  });
  return { desde: r.desde, hasta: r.hasta, obras: Object.keys(obras).map(function (k) { var o = obras[k]; o.horas = Math.round(o.horas * 10) / 10; o.extras = Math.round(o.extras * 10) / 10; return o; }) };
}

/* ---------- Configuración, jefes, monitoreo ---------- */
function a_adminConfig() {
  var c = cfg_(), o = JSON.parse(JSON.stringify(c)); o.legalEfectivo = legal_(); o.tiposAlerta = TIPOS_ALERTA;
  o.jefes = leer('Jefes').map(function (j) { return { id: j.id, nombre: j.nombre, cargo: j.cargo, email: j.email, whatsapp: j.whatsapp, centros: json_(j.centros, []), activo: j.activo !== '0', tienePin: !!j.pin }; });
  o.codigoAdminPendiente = !!prop_('CODIGO_ADMIN'); return o;
}
function a_adminConfigGuardar(d, adm) {
  var cambios = [];
  Object.keys(d).forEach(function (k) {
    if (!(k in CFG_DEF) || k === 'zona') return; var v = d[k], def = CFG_DEF[k];
    if (typeof def === 'number') { v = +v; if (isNaN(v) || v < 0) throw E_('DATOS', 'Valor no válido en "' + k + '".'); }
    else if (typeof def === 'boolean') v = !!v;
    else if (typeof def === 'string') v = txt_(v, 300);
    else if (k === 'legal') { var L = {}; Object.keys(v || {}).forEach(function (q) { if (!(q in Motor.DEF)) return; if (q === 'festivosExtra') L[q] = (v[q] || []).filter(function (f) { return /^\d{4}-\d\d-\d\d$/.test(f); }); else if (typeof Motor.DEF[q] === 'string') L[q] = /^\d\d:\d\d$/.test(v[q]) ? v[q] : Motor.DEF[q]; else if (typeof Motor.DEF[q] === 'boolean') L[q] = !!v[q]; else if (v[q] !== '' && v[q] !== null && !isNaN(+v[q])) L[q] = +v[q]; }); v = L; }
    else if (k === 'empresa') { var e = {}; Object.keys(CFG_DEF.empresa).forEach(function (q) { e[q] = txt_((v || {})[q], q === 'logo' ? 40000 : 200); }); if (e.logo && !/^data:image\/(png|jpeg|webp);base64,/.test(e.logo) && !/^https:\/\//.test(e.logo)) e.logo = ''; if (e.color && !/^#[0-9a-fA-F]{6}$/.test(e.color)) e.color = ''; v = e; }
    else if (k === 'alertas') { var al = {}; Object.keys(TIPOS_ALERTA).forEach(function (q) { var x = (v || {})[q] || {}; al[q] = { activo: x.activo !== false, correos: txt_(x.correos, 300) }; }); v = al; }
    cfgSet_(k, v); cambios.push(k);
  });
  auditar_(adm.cedula, 'configuracion', cambios.join(', ')); return a_adminConfig();
}
function a_adminJefeGuardar(d, adm) {
  var j = d.id ? buscar('Jefes', 'id', d.id) : null, nuevo = !j; if (nuevo) j = { id: id_().substr(0, 8), pin: '' };
  if (!txt_(d.nombre, 80)) throw E_('DATOS', 'Escribe el nombre del jefe.');
  j.nombre = txt_(d.nombre, 80); j.cargo = txt_(d.cargo, 60); j.email = txt_(d.email, 120); j.whatsapp = soloDigitos_(d.whatsapp).substr(0, 15); j.centros = JSON.stringify((d.centros || []).map(function (x) { return txt_(x, 20); })); j.activo = d.activo === false ? '0' : '1';
  if (d.pin) { if (!/^\d{4,8}$/.test(String(d.pin))) throw E_('DATOS', 'La clave de firma debe tener entre 4 y 8 números.'); j.pin = hmac_('pin|' + j.id + '|' + d.pin); }
  if (!j.pin) throw E_('DATOS', 'Asigna una clave de firma. Sin ella el jefe no puede firmar.');
  if (nuevo) agregar('Jefes', j); else guardar('Jefes', j);
  auditar_(adm.cedula, nuevo ? 'jefe_creado' : 'jefe_editado', { id: j.id, nombre: j.nombre, cambioClave: !!d.pin }); return {};
}
function a_adminBitacoras(d) {
  var n = { alertas: 'Alertas', auditoria: 'Auditoria', errores: 'Errores' }[d.cual]; if (!n) throw E_('DATOS', 'Bitácora desconocida.');
  return leer(n, 400).reverse().map(function (r) { var o = {}; HOJAS[n].forEach(function (k) { o[k] = r[k]; }); return o; });
}
function a_adminSalud() {
  var a = ahora_(), conteo = {}, disparadores = [], cupo = null, pruebas = autoPrueba_();
  Object.keys(HOJAS).forEach(function (h) { conteo[h] = Math.max(0, hoja_(h).getLastRow() - 1); });
  try { disparadores = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); }); } catch (e) { }
  try { cupo = MailApp.getRemainingDailyQuota(); } catch (e) { }
  var hace7 = Motor.sumar(a.fecha, -7);
  return { version: VERSION, ahora: a.iso, filas: conteo, disparadores: disparadores, cupoCorreo: cupo, ultimoRespaldo: prop_('ULTIMO_RESPALDO') || '', ultimaLimpieza: prop_('ULTIMA_LIMPIEZA') || '',
    errores7d: leer('Errores', 400).filter(function (e) { return e.fecha >= hace7; }).length, sesiones: leer('Sesiones').length, pruebas: pruebas,
    capacidad: Math.round(conteo.Marcaciones / 2000) / 10 }; // % aproximado frente a 200.000 filas recomendadas
}
function a_adminRespaldar(d, adm) { var r = respaldar_(); auditar_(adm.cedula, 'respaldo_manual', r); return { resultado: r }; }

// Pruebas rápidas del motor que corren en el propio servidor (el conjunto completo está en /tests).
function autoPrueba_() {
  var H = { e: '07:00', s: '16:24', ai: '12:00', af: '13:00', tol: 5 }, r = [];
  function p(n, ok) { r.push({ nombre: n, ok: !!ok }); }
  try {
    p('Festivos 2026 (18 días)', Object.keys(Motor.festivos(2026)).length === 18);
    p('Jornada diaria 8,4 h', Motor.liquidarDia({ fecha: '2026-11-10', entrada: '07:00', salAlm: '12:00', entAlm: '13:00', salida: '16:24' }, H).ordDiu === 504);
    p('Almuerzo olvidado se asume', Motor.liquidarDia({ fecha: '2026-11-10', entrada: '07:00', salida: '16:24' }, H).trabajadoMin === 504);
    p('Extra nocturna desde 19:00', Motor.liquidarDia({ fecha: '2026-11-10', entrada: '07:00', salAlm: '12:00', entAlm: '13:00', salida: '20:24' }, H).extNoc === 84);
    p('Recargo dominical 90 %', Motor.recDominical('2026-11-15', Motor.cfg()) === 0.9);
    p('Quincena = 15 días', Motor.diasNomina('2026-10-16', '2026-10-31') === 15);
    p('Hoja y secreto disponibles', !!ss_() && !!prop_('SECRETO'));
    p('Carpeta de fotos accesible', !!DriveApp.getFolderById(prop_('CARPETA_FOTOS')));
  } catch (e) { p('Error al ejecutar: ' + e.message, false); }
  return r;
}

/* ---------- Exportación ---------- */
function a_adminExportar(d) {
  var r = rango_(d, 62), h = function (m) { return Math.round(m / 6) / 10; }, cs = {}; centros_().forEach(function (c) { cs[c.id] = c.nombre; });
  var previa = a_adminNominaPrevia(r), n = {}; leer('Usuarios').forEach(function (u) { n[u.cedula] = u.nombre; });
  var dentro = function (a, b) { return a <= r.hasta && b >= r.desde; };
  return { desde: r.desde, hasta: r.hasta, empresa: cfg_().empresa.nombre,
    Personal: leer('Usuarios').map(function (u) { return { 'Cédula': u.cedula, Nombre: u.nombre, Cargo: u.cargo, 'Centro de trabajo': cs[u.centroId] || '', Rol: u.rol, Estado: u.estado, Salario: +u.salario || 0, 'Salario validado': u.salarioOk === '1' ? 'Sí' : 'No', 'Tipo de pago': u.tipoPago, Ingreso: u.ingreso, EPS: u.eps, ARL: u.arl, Correo: u.email, 'Teléfono': u.telefono }; }),
    Jornadas: a_adminMarcaciones(r).reverse().map(function (x) { return { Fecha: x.fecha, 'Cédula': x.cedula, Nombre: x.nombre, 'Centro de trabajo': x.centro, Entrada: x.entrada, 'Salida almuerzo': x.salAlm, 'Regreso almuerzo': x.entAlm, Salida: x.salida, 'Horas trabajadas': h(x.min), 'Horas extra': h(x.extra), 'Minutos tarde': x.tarde, 'Marcación digitada': x.marcas.some(function (m) { return m.manual; }) ? 'Sí' : '', 'Fuera de zona': x.marcas.some(function (m) { return m.enZona === '0'; }) ? 'Sí' : '', Incompleta: x.incompleto ? 'Sí' : '' }; }),
    'Horas extra': a_adminExtras({}).filter(function (x) { return x.fecha >= r.desde && x.fecha <= r.hasta; }).map(function (x) { return { Fecha: x.fecha, 'Cédula': x.cedula, Nombre: x.nombre, 'Horas calculadas': h(x.minCalc), 'Horas aprobadas': x.minAprob === null ? '' : h(x.minAprob), Estado: x.estado, 'Supera tope diario': x.superaDia ? 'Sí' : '', 'Observación': x.obs }; }),
    Permisos: leer('Permisos').filter(function (p) { return dentro(p.fechaSalida, p.fechaRegreso); }).map(function (p) { var q = permisoPub_(p); return { 'Cédula': p.cedula, Nombre: q.nombre, Tipo: q.tipoNombre, Norma: q.norma, Remunerado: q.remunerado ? 'Sí' : 'No', 'Fecha salida': p.fechaSalida, 'Hora salida': p.horaSalida, 'Fecha regreso': p.fechaRegreso, 'Hora regreso': p.horaRegreso, Motivo: p.motivo, Estado: p.estado, Firmas: q.firmas.map(function (f) { return f.nombre + ': ' + f.estado; }).join(' | '), 'Decidido por': p.decididoPor, 'Observación': p.obs }; }),
    Incapacidades: leer('Incapacidades').filter(function (i) { return dentro(i.desde, i.hasta); }).map(function (i) { return { 'Cédula': i.cedula, Nombre: n[i.cedula] || '', Tipo: i.tipo, Desde: i.desde, Hasta: i.hasta, 'Días': Motor.diasEntre(i.desde, i.hasta) + 1, Entidad: i.entidad, Nota: i.nota }; }),
    'Nómina estimada': previa.filas.map(function (x) { var q = x.liq, v = function (c) { var t = q.conceptos.filter(function (k) { return k.cod === c; })[0]; return t ? t.valor : 0; };
      return { 'Cédula': x.cedula, Nombre: x.nombre, 'Centro de trabajo': x.centro, Salario: x.salario, 'Días liquidados': q.diasNomina, 'Horas trabajadas': q.horas.trabajadas, 'Horas extra pagadas': q.horas.extras, 'Horas extra sin aprobar': q.horas.extrasSinAprobar, Ausencias: q.ausencias, Tardanzas: q.tardanzas,
        'Salario básico': v('SAL'), 'Recargos y dominicales': v('RN') + v('DF') + v('DFN'), 'Horas extra $': v('HED') + v('HEN') + v('HEDF') + v('HENF'), 'Auxilio transporte': v('AUX'), Devengado: q.devengado, Deducciones: q.deducciones, 'Neto a pagar': q.neto }; }),
    'Resumen por obra': a_adminResumenObra(r).obras.map(function (o) { return { 'Centro de trabajo': o.centro, 'Personas asignadas': o.personas, 'Días-persona trabajados': o.dias, 'Horas trabajadas': o.horas, 'Horas extra': o.extras, Tardanzas: o.tardanzas, Ausencias: o.ausencias, 'Costo devengado del personal asignado': o.costo }; }) };
}

/* ---------- Registro de acciones ---------- */
function registrarAcciones_() {
  var P = 'publico', U = 'usuario', A = 'admin';
  [['publico', P, 0, a_publico], ['consultarCedula', P, 0, a_consultarCedula], ['registro', P, 1, a_registro], ['login', P, 1, a_login], ['firmaVer', P, 0, a_firmaVer], ['firmaResponder', P, 1, a_firmaResponder], ['error', P, 1, a_error],
   ['salir', U, 1, a_salir], ['cambiarClave', U, 1, a_cambiarClave], ['consentir', U, 1, a_consentir], ['misDatos', U, 1, a_misDatos], ['yo', U, 0, a_yo], ['marcar', U, 1, a_marcar], ['bloqueo', U, 1, a_bloqueo], ['historial', U, 0, a_historial],
   ['permisoCrear', U, 1, a_permisoCrear], ['permisosMios', U, 0, a_permisosMios], ['permisoCancelar', U, 1, a_permisoCancelar], ['desprendibles', U, 0, a_desprendibles],
   ['adminTablero', A, 0, a_adminTablero], ['adminPersonal', A, 0, a_adminPersonal], ['adminPersonaGuardar', A, 1, a_adminPersonaGuardar], ['adminPersonaCodigo', A, 1, a_adminPersonaCodigo], ['adminPersonaImportar', A, 1, a_adminPersonaImportar],
   ['adminCentros', A, 0, a_adminCentros], ['adminCentroGuardar', A, 1, a_adminCentroGuardar], ['adminMarcaciones', A, 0, a_adminMarcaciones], ['adminMarcacionGuardar', A, 1, a_adminMarcacionGuardar], ['adminMarcacionRevisada', A, 1, a_adminMarcacionRevisada], ['adminFoto', A, 0, a_adminFoto],
   ['adminPermisos', A, 0, a_adminPermisos], ['adminPermisoDecidir', A, 1, a_adminPermisoDecidir], ['adminIncapacidades', A, 0, a_adminIncapacidades], ['adminIncapacidadGuardar', A, 1, a_adminIncapacidadGuardar],
   ['adminExtras', A, 0, a_adminExtras], ['adminExtraDecidir', A, 1, a_adminExtraDecidir], ['adminNominaPrevia', A, 0, a_adminNominaPrevia], ['adminNominaCerrar', A, 1, a_adminNominaCerrar], ['adminNominas', A, 0, a_adminNominas], ['adminNominaDetalle', A, 0, a_adminNominaDetalle],
   ['adminResumenObra', A, 0, a_adminResumenObra], ['adminConfig', A, 0, a_adminConfig], ['adminConfigGuardar', A, 1, a_adminConfigGuardar], ['adminJefeGuardar', A, 1, a_adminJefeGuardar], ['adminBitacoras', A, 0, a_adminBitacoras], ['adminSalud', A, 0, a_adminSalud],
   ['adminRespaldar', A, 1, a_adminRespaldar], ['adminExportar', A, 0, a_adminExportar]
  ].forEach(function (x) { accion_(x[0], x[1], !!x[2], x[3]); });
}
