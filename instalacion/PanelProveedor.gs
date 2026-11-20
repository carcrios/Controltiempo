/**
 * PANEL DE PROVEEDOR — Control de jornada
 * Pega este archivo en una hoja de Google Sheets tuya (Extensiones → Apps Script).
 * IMPORTANTE: pon aquí EXACTAMENTE la misma CLAVE_LICENCIA_PROVEEDOR que pusiste en tu plantilla ControlJornada.gs.
 */
var CLAVE_LICENCIA_PROVEEDOR = 'CAMBIA-ESTA-CLAVE-POR-UNA-SECRETA-TUYA';

var COLS_CLIENTES = [
  'Empresa', 'NIT', 'Contacto', 'WhatsApp',
  'Plan (basico/profesional/empresa)', 'ModulosExtra (separados por coma)',
  'MaxUsuarios', 'Vence (AAAA-MM-DD)', 'Estado', 'Llave de licencia', 'Notas'
];

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Panel de Proveedor')
    .addItem('1. Preparar hoja de clientes', 'prepararHojaClientes')
    .addItem('2. Generar / actualizar llaves de licencia', 'generarLlaves')
    .addItem('3. Renovar cliente seleccionado (+30 días)', 'renovarSeleccionado')
    .addSeparator()
    .addItem('Ver clientes por vencer o vencidos', 'verVencimientos')
    .addToUi();
}

function prepararHojaClientes() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var h = ss.getSheetByName('Clientes') || ss.insertSheet('Clientes');
  h.getRange(1, 1, 1, COLS_CLIENTES.length).setValues([COLS_CLIENTES]).setFontWeight('bold').setBackground('#0E4A5A').setFontColor('#FFFFFF');
  h.setFrozenRows(1);
  if (h.getLastRow() < 2) {
    h.appendRow(['Ejemplo S.A.S.', '900123456-1', 'Juan Pérez', '3001234567', 'profesional', '', '80', sumarDiasHoy_(30), '', '', 'Cliente de prueba']);
  }
  SpreadsheetApp.getUi().alert('Hoja "Clientes" lista.\n\n1. Cambia CLAVE_LICENCIA_PROVEEDOR en Apps Script (debe ser idéntica a la de tu plantilla).\n2. Llena tus clientes y usa "2. Generar / actualizar llaves de licencia".');
}

function hex_(bytes) {
  return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

function firmarLicencia_(plan, modulosExtra, maxUsuarios, vence) {
  var payload = {
    plan: String(plan || 'basico').trim().toLowerCase(),
    modulosExtra: String(modulosExtra || '').split(/[,;\s]+/).map(function (x) { return x.trim(); }).filter(Boolean),
    maxUsuarios: Math.max(1, Math.round(+maxUsuarios || 0)) || undefined,
    vence: String(vence || '').trim().substr(0, 10)
  };
  var b64 = Utilities.base64EncodeWebSafe(JSON.stringify(payload));
  var firma = hex_(Utilities.computeHmacSha256Signature(b64, CLAVE_LICENCIA_PROVEEDOR)).substr(0, 32);
  return b64 + '.' + firma;
}

function hoyIso_() {
  return Utilities.formatDate(new Date(), 'America/Bogota', 'yyyy-MM-dd');
}

function sumarDiasIso_(iso, dias) {
  var p = String(iso).split('-');
  var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + dias));
  return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
}

function sumarDiasHoy_(dias) {
  return sumarDiasIso_(hoyIso_(), dias);
}

function generarLlaves() {
  if (!CLAVE_LICENCIA_PROVEEDOR || CLAVE_LICENCIA_PROVEEDOR === 'CAMBIA-ESTA-CLAVE-POR-UNA-SECRETA-TUYA') {
    return SpreadsheetApp.getUi().alert('Primero cambia CLAVE_LICENCIA_PROVEEDOR en el editor de Apps Script.');
  }
  var h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Clientes');
  if (!h || h.getLastRow() < 2) return SpreadsheetApp.getUi().alert('Primero ejecuta "1. Preparar hoja de clientes".');
  var n = h.getLastRow() - 1, hoy = hoyIso_(), pronto = sumarDiasHoy_(7);
  var v = h.getRange(2, 1, n, COLS_CLIENTES.length).getValues(), generadas = 0;
  for (var i = 0; i < v.length; i++) {
    var emp = String(v[i][0] || '').trim(); if (!emp) continue;
    var plan = String(v[i][4] || 'basico').trim().toLowerCase();
    var extra = String(v[i][5] || '').trim();
    var maxU = v[i][6];
    var vence = v[i][7] instanceof Date ? Utilities.formatDate(v[i][7], 'America/Bogota', 'yyyy-MM-dd') : String(v[i][7] || '').trim().substr(0, 10);
    v[i][7] = vence;
    v[i][8] = !vence ? 'Sin vencimiento' : (vence < hoy ? 'VENCIDA (Bloqueada)' : vence <= pronto ? 'Por vencer' : 'Activa');
    v[i][9] = firmarLicencia_(plan, extra, maxU, vence);
    generadas++;
  }
  h.getRange(2, 1, n, COLS_CLIENTES.length).setValues(v);
  SpreadsheetApp.getUi().alert('Listo: se generaron/actualizaron ' + generadas + ' llave(s) de licencia.\nCopia la columna "Llave de licencia" y envíasela al cliente.');
}

function renovarSeleccionado() {
  var h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Clientes');
  if (!h) return;
  var fila = h.getActiveRange().getRow();
  if (fila < 2) return SpreadsheetApp.getUi().alert('Selecciona la fila de un cliente primero.');
  var v = h.getRange(fila, 1, 1, COLS_CLIENTES.length).getValues()[0];
  var actual = v[7] instanceof Date ? Utilities.formatDate(v[7], 'America/Bogota', 'yyyy-MM-dd') : String(v[7] || '').trim().substr(0, 10);
  var base = /^\d{4}-\d\d-\d\d$/.test(actual) && actual >= hoyIso_() ? actual : hoyIso_();
  var nueva = sumarDiasIso_(base, 30);
  h.getRange(fila, 8).setValue(nueva);
  generarLlaves();
  SpreadsheetApp.getUi().alert('Cliente "' + v[0] + '" renovado hasta ' + nueva + '.\nSu nueva llave ya está lista en la columna J.');
}

function verVencimientos() {
  var h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Clientes');
  if (!h || h.getLastRow() < 2) return;
  var hoy = hoyIso_(), pronto = sumarDiasHoy_(7), v = h.getRange(2, 1, h.getLastRow() - 1, COLS_CLIENTES.length).getValues();
  var vencidos = [], porVencer = [];
  v.forEach(function (r) {
    var emp = String(r[0] || '').trim(); if (!emp) return;
    var vence = r[7] instanceof Date ? Utilities.formatDate(r[7], 'America/Bogota', 'yyyy-MM-dd') : String(r[7] || '').trim().substr(0, 10);
    if (!vence) return;
    if (vence < hoy) vencidos.push('• ' + emp + ' (venció ' + vence + ')');
    else if (vence <= pronto) porVencer.push('• ' + emp + ' (vence ' + vence + ')');
  });
  var msg = (vencidos.length ? 'VENCIDOS (bloqueados):\n' + vencidos.join('\n') + '\n\n' : '') +
            (porVencer.length ? 'POR VENCER (próximos 7 días):\n' + porVencer.join('\n') : 'No hay clientes por vencer en los próximos 7 días.');
  SpreadsheetApp.getUi().alert(msg);
}
