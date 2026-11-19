/**
 * CONTROL DE JORNADA — Módulos avanzados v1.6.0:
 * Modo Kiosco, Provisiones de prestaciones, Simulador de liquidación, Préstamos/cuotas,
 * Banco de compensatorios, Certificado laboral, Comunicados con lectura,
 * Presupuesto por obra, Vista en vivo, Expediente/Tablero 360° y Licenciamiento.
 */

/* ---------- 1. Modo Kiosco (tablet compartida en portería/obra) ---------- */
function a_kioscoMarcar(d, sup) {
  var ced = soloDigitos_(d.cedula); if (ced.length < 5) throw E_('DATOS', 'Escribe la cédula.');
  bloqueado_('kio:' + ced, 8);
  var u = buscar('Usuarios', 'cedula', ced);
  if (!u || !u.hash || !verificarClave_(String(d.clave || ''), u.salt, u.hash)) {
    fallo_('kio:' + ced, 600);
    throw E_('CREDENCIALES', 'Cédula o contraseña incorrecta.');
  }
  if (u.estado !== 'activo') throw E_('PERMISO', 'Usuario inactivo o pendiente.');
  if (!enAlcance_(sup, u.cedula)) throw E_('PERMISO', 'Esta persona no pertenece a tu centro.');
  var res = a_marcar({
    tipo: d.tipo, lat: d.lat, lng: d.lng, prec: d.prec, centroId: d.centroId || u.centroId,
    foto: d.foto, qrCodigo: d.qrCodigo, id: d.id
  }, u);
  auditar_(sup.cedula, 'kiosco_marcacion', { cedula: u.cedula, tipo: d.tipo });
  return { usuario: u.nombre, resultado: res };
}

/* ---------- 2. Provisiones de prestaciones sociales (Colombia) ---------- */
function a_adminProvisiones(d) {
  var r = rango_(d, 62), corte = r.hasta < r.hoy ? r.hasta : r.hoy;
  var previa = a_adminNominaPrevia({ desde: r.desde, hasta: r.hasta });
  var total = { devengado: 0, prima: 0, cesantias: 0, intereses: 0, vacaciones: 0, totalProvisiones: 0, costoTotal: 0 };
  var filas = previa.filas.map(function (x) {
    var basePrest = x.liq.devengado; // incluye auxilio de transporte para prima y cesantías
    var baseVac = Math.max(0, x.liq.devengado - ((x.liq.conceptos.filter(function (k) { return k.cod === 'AUX'; })[0] || {}).valor || 0));
    var prima = Math.round(basePrest * 0.083333);
    var cesantias = Math.round(basePrest * 0.083333);
    var intereses = Math.round(cesantias * 0.12);
    var vacaciones = Math.round(baseVac * 0.041667);
    var totP = prima + cesantias + intereses + vacaciones;
    total.devengado += x.liq.devengado; total.prima += prima; total.cesantias += cesantias;
    total.intereses += intereses; total.vacaciones += vacaciones; total.totalProvisiones += totP; total.costoTotal += x.liq.devengado + totP;
    return { cedula: x.cedula, nombre: x.nombre, centro: x.centro, devengado: x.liq.devengado, prima: prima, cesantias: cesantias, intereses: intereses, vacaciones: vacaciones, totalProvisiones: totP, costoTotal: x.liq.devengado + totP };
  });
  return { desde: r.desde, hasta: r.hasta, corte: corte, filas: filas, total: total };
}

/* ---------- 5. Simulador de liquidación de contrato ---------- */
function a_adminLiquidacionContrato(d) {
  var u = buscar('Usuarios', 'cedula', soloDigitos_(d.cedula));
  if (!u) throw E_('DATOS', 'No se encontró la persona.');
  var L = legal_(), retiro = /^\d{4}-\d\d-\d\d$/.test(d.fechaRetiro || '') ? d.fechaRetiro : (u.retiro || ahora_().fecha);
  var ingreso = String(u.ingreso || '').substr(0, 10);
  if (!/^\d{4}-\d\d-\d\d$/.test(ingreso) || retiro < ingreso) throw E_('DATOS', 'Verifica la fecha de ingreso y la fecha de retiro.');
  var sal = +u.salario || 0, aux = sal <= L.smmlv * L.topeAuxSmmlv ? L.auxTransporte : 0, basePrest = sal + aux;
  var anio = retiro.substr(0, 4), iniAnio = anio + '-01-01', iniSem = retiro.substr(5, 2) >= '07' ? anio + '-07-01' : iniAnio;
  var diasAnio = Math.max(1, Motor.diasEntre(ingreso > iniAnio ? ingreso : iniAnio, retiro) + 1);
  var diasSem = Math.max(1, Motor.diasEntre(ingreso > iniSem ? ingreso : iniSem, retiro) + 1);
  var cesantias = Math.round((basePrest * diasAnio) / 360);
  var intereses = Math.round((cesantias * diasAnio * 0.12) / 360);
  var prima = Math.round((basePrest * diasSem) / 360);
  var causadas = Motor.vacacionesCausadas(ingreso, retiro), tomadas = 0;
  leer('Permisos').forEach(function (p) { if (p.cedula === u.cedula && p.tipo === 'vacaciones' && p.estado === 'aprobado') tomadas += Motor.diasHabiles(p.fechaSalida, Motor.sumar(p.fechaRegreso, -1), L, false); });
  var diasVacPend = Math.max(0, Math.round((causadas - tomadas) * 10) / 10);
  var vacaciones = Math.round((sal / 30) * diasVacPend);
  var saldoPrestamos = 0;
  leer('Prestamos').forEach(function (p) { if (p.cedula === u.cedula && p.estado === 'activo') saldoPrestamos += +p.saldo || 0; });
  var total = cesantias + intereses + prima + vacaciones - saldoPrestamos;
  return { cedula: u.cedula, nombre: u.nombre, ingreso: ingreso, retiro: retiro, salario: sal, auxTransporte: aux, diasAnio: diasAnio, diasSemestre: diasSem,
    cesantias: cesantias, interesesCesantias: intereses, prima: prima, diasVacacionesPendientes: diasVacPend, vacaciones: vacaciones, descuentoPrestamos: saldoPrestamos, totalEstimado: total };
}

/* ---------- 6. Préstamos y adelantos con cuotas ---------- */
function a_adminPrestamos() {
  var nom = {}; leer('Usuarios').forEach(function (u) { nom[u.cedula] = u.nombre; });
  return leer('Prestamos').reverse().map(function (p) {
    return { id: p.id, cedula: p.cedula, nombre: nom[p.cedula] || p.cedula, concepto: p.concepto, monto: +p.monto, cuotas: +p.cuotas, cuotaValor: +p.cuotaValor, pagadas: +p.pagadas, saldo: +p.saldo, estado: p.estado, creado: p.creado };
  });
}
function a_adminPrestamoGuardar(d, adm) {
  var ced = soloDigitos_(d.cedula), u = buscar('Usuarios', 'cedula', ced);
  if (!u) throw E_('DATOS', 'No se encontró la persona.');
  var monto = Math.round(+d.monto || 0), cuotas = Math.max(1, Math.min(60, Math.round(+d.cuotas || 1)));
  if (monto <= 0) throw E_('DATOS', 'El monto debe ser mayor a cero.');
  var fila = {
    id: id_(), cedula: ced, concepto: txt_(d.concepto, 80) || 'Préstamo / adelanto',
    monto: String(monto), cuotas: String(cuotas), cuotaValor: String(Math.round(monto / cuotas)),
    pagadas: '0', saldo: String(monto), estado: 'activo', creadoPor: adm.cedula, creado: ahora_().iso
  };
  agregar('Prestamos', fila);
  auditar_(adm.cedula, 'prestamo_creado', { id: fila.id, cedula: ced, monto: monto, cuotas: cuotas });
  return { id: fila.id };
}
function a_adminPrestamoAplicarCuota(d, adm) {
  var p = buscar('Prestamos', 'id', txt_(d.id, 40));
  if (!p || p.estado !== 'activo') throw E_('DATOS', 'Préstamo no encontrado o ya saldado.');
  var fecha = /^\d{4}-\d\d-\d\d$/.test(d.fecha || '') ? d.fecha : ahora_().fecha;
  if (periodoCerrado_(fecha)) throw E_('CERRADO', 'La fecha pertenece a una nómina cerrada.');
  var valor = Math.min(+p.saldo, Math.round(+d.valor || +p.cuotaValor));
  agregar('Novedades', { id: id_(), cedula: p.cedula, fecha: fecha, concepto: 'Cuota: ' + p.concepto, valor: String(-valor), salarial: '', nota: 'Cuota ' + (+p.pagadas + 1) + '/' + p.cuotas, creadoPor: adm.cedula, creado: ahora_().iso });
  p.pagadas = String(+p.pagadas + 1);
  p.saldo = String(Math.max(0, +p.saldo - valor));
  if (+p.saldo <= 0) p.estado = 'pagado';
  guardar('Prestamos', p);
  auditar_(adm.cedula, 'prestamo_cuota', { id: p.id, cedula: p.cedula, valor: valor, saldo: +p.saldo });
  return { saldo: +p.saldo, estado: p.estado };
}

/* ---------- 7. Banco de horas / compensatorios ---------- */
function a_misCompensatorios(d, u) {
  var lista = leer('Compensatorios').filter(function (x) { return x.cedula === u.cedula; });
  var saldoMin = lista.reduce(function (s, x) { return s + (+x.minutos || 0); }, 0);
  return { saldoMin: saldoMin, saldoHoras: Math.round(saldoMin / 6) / 10, movimientos: lista.reverse().slice(0, 60) };
}
function a_adminCompensatorioGuardar(d, adm) {
  var ced = soloDigitos_(d.cedula); if (!buscar('Usuarios', 'cedula', ced)) throw E_('DATOS', 'No se encontró la persona.');
  var min = Math.round(+d.minutos || 0); if (!min) throw E_('DATOS', 'Indica los minutos (positivos para abonar, negativos para disfrutar).');
  var fila = { id: id_(), cedula: ced, fecha: /^\d{4}-\d\d-\d\d$/.test(d.fecha || '') ? d.fecha : ahora_().fecha, minutos: String(min), tipo: min > 0 ? 'abono' : 'disfrute', motivo: txt_(d.motivo, 160), creadoPor: adm.cedula, creado: ahora_().iso };
  agregar('Compensatorios', fila);
  auditar_(adm.cedula, 'compensatorio', { cedula: ced, minutos: min });
  return { id: fila.id };
}

/* ---------- 8. Certificado laboral en 1 clic ---------- */
function a_certificadoLaboral(d, u) {
  var c = cfg_(), a = ahora_(), conSalario = !!d.conSalario;
  var codVerif = hmac_('cert|' + u.cedula + '|' + a.fecha).substr(0, 10).toUpperCase();
  auditar_(u.cedula, 'certificado_laboral', { conSalario: conSalario, codigo: codVerif });
  return {
    empresa: c.empresa.nombre, nit: c.empresa.nit, direccion: c.empresa.direccion, telefono: c.empresa.telefono,
    fecha: a.fecha, codigoVerificacion: codVerif,
    empleado: { nombre: u.nombre, cedula: u.cedula, cargo: u.cargo || 'Colaborador', ingreso: String(u.ingreso || '').substr(0, 10), tipoContrato: u.tipoContrato || 'laboral', salario: conSalario ? (+u.salario || 0) : null, estado: u.estado }
  };
}

/* ---------- 9. Comunicados con confirmación de lectura ---------- */
function a_adminComunicadoCrear(d, adm) {
  var tit = txt_(d.titulo, 120), cuerpo = txt_(d.cuerpo, 2000);
  if (!tit || !cuerpo) throw E_('DATOS', 'Escribe el título y el mensaje del comunicado.');
  var fila = { id: id_(), titulo: tit, cuerpo: cuerpo, centros: JSON.stringify(Array.isArray(d.centros) ? d.centros : []), creadoPor: adm.cedula, creado: ahora_().iso, leidos: '{}' };
  agregar('Comunicados', fila);
  auditar_(adm.cedula, 'comunicado_creado', { id: fila.id, titulo: tit });
  return { id: fila.id };
}
function a_adminComunicados() {
  return leer('Comunicados').reverse().slice(0, 100).map(function (x) {
    var l = json_(x.leidos, {});
    return { id: x.id, titulo: x.titulo, cuerpo: x.cuerpo, centros: json_(x.centros, []), creado: x.creado, totalLeidos: Object.keys(l).length, leidos: l };
  });
}
function a_comunicadosMios(d, u) {
  return leer('Comunicados').reverse().slice(0, 50).filter(function (x) {
    var cs = json_(x.centros, []); return !cs.length || cs.indexOf(u.centroId) >= 0;
  }).map(function (x) {
    var l = json_(x.leidos, {});
    return { id: x.id, titulo: x.titulo, cuerpo: x.cuerpo, creado: x.creado, leidoEl: l[u.cedula] || '' };
  });
}
function a_comunicadoLeer(d, u) {
  var c = buscar('Comunicados', 'id', txt_(d.id, 40));
  if (!c) throw E_('DATOS', 'Comunicado no encontrado.');
  var l = json_(c.leidos, {});
  if (!l[u.cedula]) { l[u.cedula] = ahora_().iso; c.leidos = JSON.stringify(l); guardar('Comunicados', c); }
  return { leidoEl: l[u.cedula] };
}

/* ---------- 10. Presupuesto por obra (horas y costo) ---------- */
function a_adminPresupuestoObras(d) {
  var res = a_adminResumenObra(d), cs = {};
  centros_().forEach(function (c) { cs[c.id] = c; });
  return {
    desde: res.desde, hasta: res.hasta,
    obras: res.obras.map(function (o) {
      var c = cs[o.centroId] || {};
      var pH = +(c.presupuestoHoras || 0), pC = +(c.presupuestoCosto || 0);
      var pctH = pH > 0 ? Math.round((o.horas / pH) * 100) : null;
      var pctC = pC > 0 ? Math.round((o.costo / pC) * 100) : null;
      var alerta = (pctH >= 100 || pctC >= 100) ? 'excedido' : (pctH >= 80 || pctC >= 80) ? 'aviso' : 'ok';
      return { centroId: o.centroId, centro: o.centro, horas: o.horas, presupuestoHoras: pH, pctHoras: pctH, costo: o.costo, presupuestoCosto: pC, pctCosto: pctC, alerta: alerta };
    })
  };
}

/* ---------- 11. Vista en vivo «Quién está en obra ahora» ---------- */
function a_adminEnVivo(d, adm) {
  var a = ahora_(), al = alcance_(adm), marc = leer('Marcaciones', 15000), incs = leer('Incapacidades'), cs = {};
  centros_().forEach(function (c) { cs[c.id] = c.nombre; });
  var resumen = { en_obra: 0, almuerzo: 0, salio: 0, ausente: 0, cubierto: 0 };
  var personas = leer('Usuarios').filter(function (u) {
    return u.estado === 'activo' && (!al || al[u.centroId]);
  }).map(function (u) {
    var dHoy = diasDe_(marc, u.cedula, a.fecha, a.fecha)[0] || null;
    var estado = 'ausente', horas = 0;
    if (dHoy && dHoy.entrada) {
      if (dHoy.salida) estado = 'salio';
      else if (dHoy.salAlm && !dHoy.entAlm) estado = 'almuerzo';
      else estado = 'en_obra';
      var finIso = dHoy.salida ? (a.fecha + 'T' + dHoy.salida) : a.iso;
      horas = Math.max(0, Math.round(((isoMs_(finIso) - isoMs_(a.fecha + 'T' + dHoy.entrada)) / 3600000) * 10) / 10);
    } else if (cubierto_(u.cedula, a.fecha, incs)) {
      estado = 'cubierto';
    }
    resumen[estado]++;
    return { cedula: u.cedula, nombre: u.nombre, cargo: u.cargo, centroId: u.centroId, centro: cs[u.centroId] || '', estado: estado, entrada: dHoy ? (dHoy.entrada || '') : '', salida: dHoy ? (dHoy.salida || '') : '', horasTranscurridas: horas };
  });
  return { fecha: a.fecha, hora: a.hora, resumen: resumen, personas: personas };
}

/* ---------- 12. Autoservicio del trabajador: programación, préstamos, extras, incapacidad y emergencias ---------- */
function a_miProgramacion(d, u) {
  var a = ahora_(), n = Math.max(1, Math.min(31, Math.round(+d.dias || 14))), centro = centroDe_(u.centroId), L = legal_(), dias = [];
  var incs = leer('Incapacidades').filter(function (i) { return i.cedula === u.cedula; });
  var perms = permisosAprobados_(u.cedula);
  for (var i = 0; i < n; i++) {
    var f = Motor.sumar(a.fecha, i), hor = horarioDe_(centro, f, u.cedula);
    var enInc = incs.some(function (x) { return x.desde <= f && f <= x.hasta; });
    var enPerm = perms.some(function (p) { return p.desde <= f && f <= p.hasta && !p.horas; });
    var nov = enInc ? 'incapacidad' : enPerm ? 'permiso' : '';
    dias.push({ fecha: f, festivo: Motor.esFestivo(f, L), centro: centro ? centro.nombre : '', descanso: !hor || !!nov, novedad: nov, horario: nov ? null : hor });
  }
  return { desde: a.fecha, dias: dias };
}
function a_misPrestamos(d, u) {
  return leer('Prestamos').filter(function (p) { return p.cedula === u.cedula; }).reverse().map(function (p) {
    return { id: p.id, concepto: p.concepto, monto: +p.monto, cuotas: +p.cuotas, cuotaValor: +p.cuotaValor, pagadas: +p.pagadas, saldo: +p.saldo, estado: p.estado, creado: p.creado };
  });
}
function a_misExtras(d, u) {
  return leer('Extras').filter(function (x) { return x.cedula === u.cedula; }).reverse().slice(0, 60).map(function (x) {
    return { id: x.id, fecha: x.fecha, minCalc: +x.minCalc || 0, minAprob: x.minAprob === '' ? null : +x.minAprob, estado: x.estado, obs: x.obs || '' };
  });
}
function a_incapacidadReportar(d, u) {
  var re = /^\d{4}-\d\d-\d\d$/, desde = d.desde || '', hasta = d.hasta || '';
  if (!re.test(desde) || !re.test(hasta) || hasta < desde) throw E_('DATOS', 'Indica fechas válidas de inicio y fin.');
  if (periodoCerrado_(desde)) throw E_('CERRADO', 'Esa fecha pertenece a una nómina ya cerrada. Comunícate con el administrador.');
  var tipo = ['general', 'laboral', 'maternidad', 'paternidad'].indexOf(d.tipo) >= 0 ? d.tipo : 'general';
  var sop = d.foto ? guardarImagen_(d.foto, 'INCAP_' + u.cedula + '_' + desde + '.jpg', 'CARPETA_FOTOS') : '';
  var fila = { id: id_(), cedula: u.cedula, tipo: tipo, desde: desde, hasta: hasta, entidad: txt_(d.entidad, 60) || u.eps || '', nota: txt_(d.nota, 200), soporte: sop, registradoPor: 'trabajador:' + u.cedula, creado: ahora_().iso };
  agregar('Incapacidades', fila);
  alertar_('permiso_nuevo', u.cedula, 'Reportó incapacidad (' + tipo + ') del ' + desde + ' al ' + hasta + '. Verifica el soporte en el panel.');
  auditar_(u.cedula, 'incapacidad_reportada', { id: fila.id, tipo: tipo, desde: desde, hasta: hasta });
  return { id: fila.id };
}
function a_contactosEmergencia(d, u) {
  var c = cfg_(), lista = [];
  if (c.empresa.telefono) lista.push({ nombre: c.empresa.nombre, rol: 'Empresa', telefono: c.empresa.telefono });
  if (Array.isArray(c.contactosEmergencia)) c.contactosEmergencia.forEach(function (x) { if (x && x.telefono) lista.push({ nombre: txt_(x.nombre, 80), rol: txt_(x.rol, 40) || 'Emergencia', telefono: soloDigitos_(x.telefono) }); });
  leer('Jefes').forEach(function (j) {
    if (j.activo === '0' || !j.whatsapp) return;
    var cs = json_(j.centros, []);
    if (!cs.length || cs.indexOf(u.centroId) >= 0) lista.push({ nombre: j.nombre, rol: j.cargo || 'Jefe inmediato', telefono: j.whatsapp });
  });
  return { arl: u.arl || '', eps: u.eps || '', contactos: lista };
}

/* ---------- 13. Interconexión total: Expediente 360° y Tablero Gerencial 360° ---------- */
function a_adminExpediente360(d, adm) {
  var ced = soloDigitos_(d.cedula), u = buscar('Usuarios', 'cedula', ced);
  if (!u) throw E_('DATOS', 'No se encontró la persona.');
  if (!enAlcance_(adm, u.cedula)) throw E_('PERMISO', 'Esta persona no pertenece a tu centro.');
  var a = ahora_(), marc = leer('Marcaciones', 15000), L = legal_();
  var tom = 0; leer('Permisos').forEach(function (p) { if (p.cedula === u.cedula && p.tipo === 'vacaciones' && p.estado === 'aprobado') tom += Motor.diasHabiles(p.fechaSalida, Motor.sumar(p.fechaRegreso, -1), L, false); });
  var ultNom = leer('Nomina').filter(function (n) { return n.cedula === u.cedula; }).slice(-1)[0] || null;
  return {
    usuario: usuarioPublico_(u),
    hoy: estadoHoy_(u, marc),
    resumenPeriodo: resumen_(u, marc),
    programacion: a_miProgramacion({ dias: 14 }, u),
    vacaciones: { causadas: Motor.vacacionesCausadas(u.ingreso, a.fecha), tomadas: tom },
    compensatorios: a_misCompensatorios({}, u),
    prestamos: a_misPrestamos({}, u),
    extras: a_misExtras({}, u).slice(0, 15),
    comunicadosPendientes: a_comunicadosMios({}, u).filter(function (c) { return !c.leidoEl; }).length,
    ultimaNomina: ultNom ? { id: ultNom.id, desde: ultNom.desde, hasta: ultNom.hasta, neto: +ultNom.neto, acuse: ultNom.acuse || '' } : null
  };
}
function a_adminTablero360(d, adm) {
  var a = ahora_(), enVivo = a_adminEnVivo({}, adm), iniMes = a.fecha.substr(0, 8) + '01';
  var extrasPendientes = a_adminExtras({ estado: 'pendiente' }, adm).length;
  var contratosPorVencer = leer('Usuarios').filter(function (u) {
    var fin = String(u.finContrato || '').substr(0, 10);
    if (u.estado !== 'activo' || !/^\d{4}-\d\d-\d\d$/.test(fin) || !enAlcance_(adm, u.cedula)) return false;
    var faltan = Motor.diasEntre(a.fecha, fin);
    return faltan >= 0 && faltan <= 35;
  }).map(function (u) { return { cedula: u.cedula, nombre: u.nombre, tipoContrato: u.tipoContrato, finContrato: u.finContrato }; });
  var presupuestos = adm.rol === 'admin' ? a_adminPresupuestoObras({ desde: iniMes, hasta: a.fecha }).obras.filter(function (o) { return o.alerta !== 'ok'; }) : [];
  return {
    fecha: a.fecha, hora: a.hora,
    enVivo: enVivo.resumen,
    alertasOperativas: {
      extrasPendientes: extrasPendientes,
      contratosPorVencer: contratosPorVencer,
      obrasPresupuestoAlerta: presupuestos
    }
  };
}

/* ---------- 14. Activación de licencia por plan y módulos ---------- */
function a_adminLicenciaActivar(d, adm) {
  var raw = txt_(d.llave, 1000);
  if (!raw || raw.split('.').length !== 2) throw E_('DATOS', 'La llave de licencia no tiene un formato válido.');
  var prev = prop_('LICENCIA');
  prop_('LICENCIA', raw);
  var lic = licenciaEfectiva_();
  if (lic.vencida && CLAVE_LICENCIA_PROVEEDOR) { prop_('LICENCIA', prev || null); throw E_('DATOS', 'La llave de licencia es inválida o está vencida.'); }
  auditar_(adm.cedula, 'licencia_activada', { plan: lic.plan, maxUsuarios: lic.maxUsuarios, vence: lic.vence });
  return lic;
}
