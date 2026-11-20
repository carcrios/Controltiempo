/* Control de jornada 1.6.1 — archivo único para pegar en Apps Script (Extensiones → Apps Script).
   Generado por herramientas/empaquetar.js: no lo edites a mano. */

// ===================== Motor.gs =====================
/**
 * MOTOR DE LIQUIDACIÓN — Colombia (CST, Ley 2101/2021, Ley 2466/2025)
 * Archivo puro (sin servicios de Google): corre igual en Apps Script y en Node (pruebas).
 * Todo parámetro legal es configurable desde el panel de administración; estos son los
 * valores por defecto vigentes a noviembre de 2026.
 */
var Motor = (function () {
  var DEF = {
    jornadaSemanalH: 42,        // Ley 2101/2021, desde 15-jul-2026
    divisorMensual: 210,        // 42 h × 30 / 6
    nocheInicio: '19:00',       // Ley 2466/2025 (desde 25-dic-2025)
    nocheFin: '06:00',
    recargoNocturno: 0.35,      // CST art. 168
    extraDiurna: 0.25,
    extraNocturna: 0.75,
    recargoDominical: null,     // null = escalonado Ley 2466 (80 % jul-2025, 90 % jul-2026, 100 % jul-2027)
    dominicalPagaHoraBase: true,// dominical ocasional: hora + recargo, adicional al salario
    maxExtraDiaH: 2,            // Ley 50/1990 art. 22
    maxExtraSemanaH: 12,
    jornadaDiaSinHorarioH: 8,
    smmlv: 1750905,             // 2026
    auxTransporte: 249095,      // 2026
    topeAuxSmmlv: 2,
    pctSalud: 0.04,
    pctPension: 0.04,
    pctSolidaridad: 0.01,       // salarios >= 4 SMMLV
    pctIncapGeneral: 0.6667,
    pctIncapLaboral: 1,
    contarAntesDeEntrada: false,// llegar antes del horario no suma tiempo (hasta 2 h antes); true = sí cuenta
    maxOrdinariaDiaH: 9,        // jornada flexible: hasta 9 h diarias sin recargo (CST art. 161); lo que pase es extra
    descontarDominical: false,  // CST art. 173: la ausencia injustificada hace perder el dominical (facultad del empleador)
    festivosExtra: []
  };

  function cfgDe(c) { var o = {}, k; for (k in DEF) o[k] = DEF[k]; for (k in (c || {})) if (c[k] !== undefined && c[k] !== null && c[k] !== '') o[k] = c[k]; return o; }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function aMin(hhmm) { if (!hhmm) return null; var p = String(hhmm).split(':'); return (+p[0]) * 60 + (+p[1]); }
  function aHHMM(m) { m = ((m % 1440) + 1440) % 1440; return p2(Math.floor(m / 60)) + ':' + p2(m % 60); }
  function fecha(iso) { var p = String(iso).substr(0, 10).split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function iso(d) { return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()); }
  function sumar(isoF, n) { var d = fecha(isoF); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
  function dow(isoF) { return fecha(isoF).getUTCDay(); } // 0 = domingo
  function lunesDe(isoF) { var w = dow(isoF); return sumar(isoF, w === 0 ? -6 : 1 - w); }
  function diasEntre(a, b) { return Math.round((fecha(b) - fecha(a)) / 86400000); }

  /* ---------- Festivos (Ley 51 de 1983) ---------- */
  var _fest = {};
  function pascua(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
      g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
      l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
      mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
    return y + '-' + p2(mes) + '-' + p2(dia);
  }
  function alLunes(f) { var w = dow(f); return w === 1 ? f : sumar(f, w === 0 ? 1 : 8 - w); }
  function festivos(y) {
    if (_fest[y]) return _fest[y];
    var s = {}, pa = pascua(y);
    ['01-01', '05-01', '07-20', '08-07', '12-08', '12-25'].forEach(function (x) { s[y + '-' + x] = 1; });
    ['01-06', '03-19', '06-29', '08-15', '10-12', '11-01', '11-11'].forEach(function (x) { s[alLunes(y + '-' + x)] = 1; });
    s[sumar(pa, -3)] = 1; s[sumar(pa, -2)] = 1; s[sumar(pa, 43)] = 1; s[sumar(pa, 64)] = 1; s[sumar(pa, 71)] = 1;
    _fest[y] = s; return s;
  }
  function esFestivo(f, cfg) { return !!festivos(+f.substr(0, 4))[f] || ((cfg && cfg.festivosExtra) || []).indexOf(f) >= 0; }
  function esDescanso(f, cfg) { return dow(f) === 0 || esFestivo(f, cfg); }
  function recDominical(f, cfg) {
    if (cfg.recargoDominical !== null && cfg.recargoDominical !== undefined) return +cfg.recargoDominical;
    return f < '2025-07-01' ? 0.75 : f < '2026-07-01' ? 0.80 : f < '2027-07-01' ? 0.90 : 1;
  }

  /* ---------- Horario ---------- */
  // horario de un centro: { "1": {e:"07:00", s:"17:00", ai:"12:00", af:"13:00"}, ... } clave = día de la semana (0-6)
  function horarioDia(horario, f, cfg, trabajaFestivos) {
    if (!horario) return null;
    if (esFestivo(f, cfg) && !trabajaFestivos) return null;
    var h = horario[String(dow(f))];
    return (h && h.e && h.s) ? h : null;
  }
  function jornadaMin(h) {
    if (!h) return 0;
    var e = aMin(h.e), s = aMin(h.s); if (s <= e) s += 1440;
    var t = s - e;
    if (h.ai && h.af) { var a = aMin(h.ai), b = aMin(h.af); if (a < e) { a += 1440; b += 1440; } if (b < a) b += 1440; t -= Math.max(0, Math.min(b, s) - Math.max(a, e)); }
    return t;
  }

  /* ---------- Liquidación de un día ---------- */
  // dia: {fecha, entrada, salAlm, entAlm, salida} en 'HH:MM' (la salida puede caer al día siguiente)
  // h: horario del día (foto tomada al fichar, para que un cambio posterior no altere días pasados) o null
  // ctx: {ordSemanaMin: ordinarias ya acumuladas en la semana, extraAprobadaMin: minutos extra aprobados}
  function liquidarDia(dia, h, cfgIn, ctx) {
    var cfg = cfgDe(cfgIn); ctx = ctx || {};
    var r = { fecha: dia.fecha, incompleto: false, almuerzoAsumido: false, tardanzaMin: 0, salidaAnticipadaMin: 0,
      trabajadoMin: 0, ordDiu: 0, ordNoc: 0, domDiu: 0, domNoc: 0, extDiu: 0, extNoc: 0, extDomDiu: 0, extDomNoc: 0,
      extraCalculadaMin: 0, extraSinAprobarMin: 0, jornadaMin: 0, ordinariasMin: 0 };
    var ent = aMin(dia.entrada), sal = aMin(dia.salida);
    if (ent === null) { r.incompleto = !!dia.salida; return r; }
    if (sal === null) { r.incompleto = true; return r; }
    if (sal <= ent) sal += 1440;
    var corte = [];
    var sa = aMin(dia.salAlm), ea = aMin(dia.entAlm);
    if (sa !== null && ea !== null) {
      if (sa < ent) sa += 1440; if (ea < sa) ea += 1440;
      corte = [Math.max(sa, ent), Math.min(ea, sal)];
    } else if (h && h.ai && h.af) {          // almuerzo sin marcar: se asume la franja programada de ese día
      var a = aMin(h.ai), b = aMin(h.af); if (a < aMin(h.e)) { a += 1440; b += 1440; } if (b < a) b += 1440;
      if (sa !== null) { if (sa < ent) sa += 1440; b = sa + (b - a); a = sa; }   // marcó salida pero no regreso
      else if (ea !== null) { if (ea < ent) ea += 1440; a = ea - (b - a); b = ea; }
      if (Math.min(b, sal) > Math.max(a, ent)) { corte = [Math.max(a, ent), Math.min(b, sal)]; r.almuerzoAsumido = true; }
    }
    var jor = h ? Math.min(jornadaMin(h), cfg.maxOrdinariaDiaH * 60) : cfg.jornadaDiaSinHorarioH * 60; r.jornadaMin = h ? jor : 0;
    if (!h && dia.libre && !esDescanso(dia.fecha, cfg)) jor = 0; // día no programado (p. ej. sábado): todo es trabajo suplementario
    if (h) {
      var tol = +(h.tol || 0), he = aMin(h.e), hs = aMin(h.s); if (hs <= he) hs += 1440;
      if (ent > he + tol) r.tardanzaMin = ent - he;
      if (sal < hs) r.salidaAnticipadaMin = hs - sal;
    }
    var ni = aMin(cfg.nocheInicio), nf = aMin(cfg.nocheFin), topeSem = cfg.jornadaSemanalH * 60;
    var ordSem = ctx.ordSemanaMin || 0, aprob = ctx.extraAprobadaMin === undefined ? 1e9 : ctx.extraAprobadaMin;
    var ordDia = 0, f0 = dia.fecha, f1 = null, d0 = esDescanso(f0, cfg), d1 = null;
    var ini = ent;
    if (h && !cfg.contarAntesDeEntrada) { var he0 = aMin(h.e); if (ent < he0 && he0 - ent <= 120) ini = he0; }
    for (var m = ini; m < sal; m++) {
      if (corte.length && m >= corte[0] && m < corte[1]) continue;
      var desc;
      if (m < 1440) desc = d0; else { if (f1 === null) { f1 = sumar(f0, 1); d1 = esDescanso(f1, cfg); } desc = d1; }
      var tod = m % 1440, noc = tod >= ni || tod < nf;
      r.trabajadoMin++;
      if (ordDia < jor && ordSem < topeSem) {
        ordDia++; ordSem++;
        if (desc) { if (noc) r.domNoc++; else r.domDiu++; } else { if (noc) r.ordNoc++; else r.ordDiu++; }
      } else {
        r.extraCalculadaMin++;
        if (aprob > 0) { aprob--; if (desc) { if (noc) r.extDomNoc++; else r.extDomDiu++; } else { if (noc) r.extNoc++; else r.extDiu++; } }
        else r.extraSinAprobarMin++;
      }
    }
    r.ordinariasMin = ordDia;
    return r;
  }

  // Liquida una lista de días. Devuelve mapa fecha -> resultado respetando el tope semanal (lunes a domingo).
  // dias: [{fecha, entrada, salAlm, entAlm, salida, horario}]  extras: {fecha: minutosAprobados} | null (= todo aprobado)
  function liquidarDias(dias, cfg, extras) {
    var orden = dias.slice().sort(function (a, b) { return a.fecha < b.fecha ? -1 : 1; }), res = {}, sem = null, acum = 0;
    orden.forEach(function (d) {
      var l = lunesDe(d.fecha); if (l !== sem) { sem = l; acum = 0; }
      var r = liquidarDia(d, d.horario || null, cfg, { ordSemanaMin: acum, extraAprobadaMin: extras ? (extras[d.fecha] || 0) : undefined });
      acum += r.ordinariasMin || 0; res[d.fecha] = r;
    });
    return res;
  }

  function avisosExtras(porFecha, cfgIn) {
    var cfg = cfgDe(cfgIn), av = [], sem = {};
    Object.keys(porFecha).forEach(function (f) {
      var x = porFecha[f].extraCalculadaMin || 0; if (!x) return;
      if (x > cfg.maxExtraDiaH * 60) av.push({ fecha: f, tipo: 'dia', min: x });
      var l = lunesDe(f); sem[l] = (sem[l] || 0) + x;
    });
    Object.keys(sem).forEach(function (l) { if (sem[l] > cfg.maxExtraSemanaH * 60) av.push({ fecha: l, tipo: 'semana', min: sem[l] }); });
    return av;
  }

  /* ---------- Periodo de nómina ---------- */
  function ultimoDia(f) { var d = fecha(f.substr(0, 8) + '01'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return iso(d); }
  function periodoDe(f, tipo) {
    var ym = f.substr(0, 8), d = +f.substr(8, 2);
    if (tipo === 'mensual') return { desde: ym + '01', hasta: ultimoDia(f) };
    return d <= 15 ? { desde: ym + '01', hasta: ym + '15' } : { desde: ym + '16', hasta: ultimoDia(f) };
  }
  // Días de nómina con la convención de meses de 30 días.
  function diasNomina(desde, hasta) {
    var n = 0, f = desde;
    while (f <= hasta) { var d = +f.substr(8, 2), fin = ultimoDia(f); if (d <= 30) n++; if (f === fin && d < 30) n += 30 - d; f = sumar(f, 1); }
    return n;
  }
  function cubre(lista, f) { for (var i = 0; i < lista.length; i++) if (lista[i].desde <= f && f <= lista[i].hasta) return lista[i]; return null; }

  /**
   * p: { usuario:{salario,tipoPago}, desde, hasta, corte (fecha hasta donde hay datos), ingreso,
   *      dias:[...], extras:{fecha:min}|null, horario (del centro), trabajaFestivos,
   *      permisos:[{desde,hasta,remunerado,horas,tipo}] (solo APROBADOS), incapacidades:[{desde,hasta,tipo}] }
   */
  function liquidarPeriodo(p, cfgIn) {
    var cfg = cfgDe(cfgIn), u = p.usuario, sal = +u.salario || 0, porDia = u.tipoPago === 'dia';
    var corte = p.corte && p.corte < p.hasta ? p.corte : p.hasta; if (p.retiro && p.retiro < corte) corte = p.retiro;
    var desde = p.ingreso && p.ingreso > p.desde ? p.ingreso : p.desde;
    var vDia = porDia ? sal : sal / 30, vHora = porDia ? sal * 30 / cfg.divisorMensual : sal / cfg.divisorMensual;
    var liq = liquidarDias(p.dias, cfg, p.extras), porFecha = {};
    var t = { trabajadoMin: 0, ordDiu: 0, ordNoc: 0, domDiu: 0, domNoc: 0, extDiu: 0, extNoc: 0, extDomDiu: 0, extDomNoc: 0, extraSinAprobarMin: 0, tardanzas: 0, tardanzaMin: 0 };
    var valores = { recNoc: 0, dom: 0, domNoc: 0, extDiu: 0, extNoc: 0, extDomDiu: 0, extDomNoc: 0 };
    var diasTrab = 0, incompletos = [];
    Object.keys(liq).forEach(function (f) {
      if (f < desde || f > corte) return;
      var r = liq[f]; porFecha[f] = r;
      if (r.incompleto) { incompletos.push(f); return; }
      if (r.trabajadoMin > 0) diasTrab++;
      ['trabajadoMin', 'ordDiu', 'ordNoc', 'domDiu', 'domNoc', 'extDiu', 'extNoc', 'extDomDiu', 'extDomNoc', 'extraSinAprobarMin', 'tardanzaMin'].forEach(function (k) { t[k] += r[k] || 0; });
      if (r.tardanzaMin) t.tardanzas++;
      var rd = recDominical(f, cfg), base = cfg.dominicalPagaHoraBase && !(r.jornadaMin > 0) && !porDia ? 1 : 0, vm = vHora / 60; // domingo habitual (está en el horario) o pago por día: solo el recargo
      valores.recNoc += r.ordNoc * vm * cfg.recargoNocturno;
      valores.dom += r.domDiu * vm * (base + rd);
      valores.domNoc += r.domNoc * vm * (base + rd + cfg.recargoNocturno);
      valores.extDiu += r.extDiu * vm * (1 + cfg.extraDiurna);
      valores.extNoc += r.extNoc * vm * (1 + cfg.extraNocturna);
      valores.extDomDiu += r.extDomDiu * vm * (1 + cfg.extraDiurna + rd);
      valores.extDomNoc += r.extDomNoc * vm * (1 + cfg.extraNocturna + rd);
    });
    var aus = 0, diasIncGen = 0, diasIncOtra = 0, diasVac = 0, diasPermNoRem = 0, horasPermNoRem = 0, f = desde, ausentes = [];
    var perms = p.permisos || [], incs = p.incapacidades || [];
    var diasIncLarga = 0, diasLic = 0, faltaSem = {}, descansos = 0;
    while (f <= corte) {
      var inc = cubre(incs, f), per = cubre(perms, f), r2 = liq[f], trabajo = r2 && (r2.trabajadoMin > 0 || r2.incompleto), es31 = +f.substr(8, 2) === 31;
      var prog = p.programado && p.programado[f] !== undefined ? p.programado[f] : !!horarioDia(p.horario, f, cfg, p.trabajaFestivos);
      if (inc) { if (!es31) { if (inc.tipo === 'general') { if (diasEntre(inc.desde, f) >= 90) diasIncLarga++; else diasIncGen++; } else diasIncOtra++; } }
      else if (per && per.tipo === 'vacaciones') { if (!es31) diasVac++; }
      else if (per && !per.horas) { if (!trabajo && !es31) { if (per.remunerado) diasLic++; else diasPermNoRem++; } }
      else if (!trabajo && prog) { faltaSem[lunesDe(f)] = 1; if (!porDia && !es31) { aus++; ausentes.push(f); } }
      else if (!trabajo && esDescanso(f, cfg)) descansos++;
      f = sumar(f, 1);
    }
    perms.forEach(function (x) { if (x.horas && !x.remunerado && x.desde >= desde && x.desde <= corte) horasPermNoRem += +x.horas; });

    var dn = diasNomina(desde, corte), c = [];
    function add(cod, concepto, cant, valor) { valor = (valor < 0 ? -1 : 1) * Math.round(Math.abs(valor)); if (valor) c.push({ cod: cod, concepto: concepto, cantidad: cant, valor: valor }); }
    var h = function (m) { return Math.round(m / 6) / 10; };
    var piso = cfg.smmlv / 30, semFalta = Object.keys(faltaSem).filter(function (l) { var dm = sumar(l, 6); return dm >= desde && dm <= corte; }).length;
    if (porDia) {
      add('SAL', 'Días trabajados', diasTrab, diasTrab * vDia);
      var dr = Math.max(0, descansos - semFalta); // CST arts. 173 y 177: el jornalero gana el descanso si no faltó sin justificación esa semana
      add('DR', 'Descanso dominical y festivo remunerado', dr, dr * vDia);
    } else {
      var dSal = Math.max(0, dn - diasIncGen - diasIncLarga - diasIncOtra - diasVac);
      add('SAL', 'Salario básico', dSal, dSal * vDia);
      add('AUS', 'Ausencias sin justificar', aus, -aus * vDia);
      if (cfg.descontarDominical) add('DNC', 'Dominical no causado por ausencia', semFalta, -semFalta * vDia);
      add('PNR', 'Permisos no remunerados (días)', diasPermNoRem, -diasPermNoRem * vDia);
      add('PNH', 'Permisos no remunerados (horas)', horasPermNoRem, -horasPermNoRem * vHora);
    }
    add('VAC', 'Vacaciones disfrutadas', diasVac, diasVac * vDia);
    add('ING', 'Incapacidad enfermedad general', diasIncGen, diasIncGen * Math.max(vDia * cfg.pctIncapGeneral, Math.min(piso, vDia)));
    add('IN5', 'Incapacidad general desde el día 91 (50 %)', diasIncLarga, diasIncLarga * Math.max(vDia * 0.5, Math.min(piso, vDia)));
    add('INL', 'Incapacidad laboral / licencia', diasIncOtra, diasIncOtra * vDia * cfg.pctIncapLaboral);
    add('RN', 'Recargo nocturno', h(t.ordNoc), valores.recNoc);
    add('DF', 'Dominical / festivo diurno', h(t.domDiu), valores.dom);
    add('DFN', 'Dominical / festivo nocturno', h(t.domNoc), valores.domNoc);
    add('HED', 'Hora extra diurna', h(t.extDiu), valores.extDiu);
    add('HEN', 'Hora extra nocturna', h(t.extNoc), valores.extNoc);
    add('HEDF', 'Hora extra diurna dominical / festiva', h(t.extDomDiu), valores.extDomDiu);
    add('HENF', 'Hora extra nocturna dominical / festiva', h(t.extDomNoc), valores.extDomNoc);
    var novs = (p.novedades || []).filter(function (n) { return n.fecha >= p.desde && n.fecha <= corte && +n.valor; });
    novs.forEach(function (n) { if (n.salarial && n.valor > 0) add('BON', n.concepto, 1, n.valor); });
    var ibc = c.reduce(function (s, x) { return s + x.valor; }, 0);
    var mensual = porDia ? sal * 30 : sal, diasAux = porDia ? diasTrab : Math.max(0, dn - aus - diasIncGen - diasIncLarga - diasIncOtra - diasVac - diasPermNoRem - diasLic);
    if (mensual <= cfg.smmlv * cfg.topeAuxSmmlv) add('AUX', 'Auxilio de transporte', diasAux, diasAux * cfg.auxTransporte / 30);
    novs.forEach(function (n) { if (!n.salarial && n.valor > 0) add('BNS', n.concepto, 1, n.valor); });
    var devengado = c.reduce(function (s, x) { return s + x.valor; }, 0), d = [];
    var ibcBase = Math.min(Math.max(0, ibc), cfg.smmlv * 25 * dn / 30); // tope de cotización: 25 SMMLV
    function ded(cod, concepto, pct) { var v = Math.round(ibcBase * pct); if (v) d.push({ cod: cod, concepto: concepto, cantidad: Math.round(pct * 10000) / 100 + ' %', valor: v }); }
    ded('SLD', 'Aporte a salud', cfg.pctSalud); ded('PEN', 'Aporte a pensión', cfg.pctPension);
    // Fondo de solidaridad pensional sobre el IBC llevado a mes (Ley 100 art. 27): 1 % desde 4 SMMLV y adicional de 0,2 a 1 % desde 16 SMMLV
    var sm = dn ? ibc * 30 / dn / cfg.smmlv : 0, adic = sm < 16 ? 0 : sm < 17 ? 0.002 : sm < 18 ? 0.004 : sm < 19 ? 0.006 : sm <= 20 ? 0.008 : 0.01;
    if (sm >= 4) ded('FSP', 'Fondo de solidaridad pensional', cfg.pctSolidaridad + adic);
    novs.forEach(function (n) { if (n.valor < 0) d.push({ cod: 'DES', concepto: n.concepto, cantidad: 1, valor: Math.round(-n.valor) }); });
    var deducciones = d.reduce(function (s, x) { return s + x.valor; }, 0);
    return { desde: p.desde, hasta: p.hasta, corte: corte, diasNomina: dn, diasTrabajados: diasTrab, valorHora: Math.round(vHora),
      horas: { trabajadas: h(t.trabajadoMin), nocturnas: h(t.ordNoc + t.domNoc), dominicales: h(t.domDiu + t.domNoc), extras: h(t.extDiu + t.extNoc + t.extDomDiu + t.extDomNoc), extrasSinAprobar: h(t.extraSinAprobarMin) },
      tardanzas: t.tardanzas, tardanzaMin: t.tardanzaMin, ausencias: aus, ausentes: ausentes, incompletos: incompletos,
      conceptos: c, deduccionesDet: d, ibc: ibc, devengado: devengado, deducciones: deducciones, neto: devengado - deducciones,
      avisos: avisosExtras(porFecha, cfg), porFecha: porFecha };
  }

  /* ---------- Vacaciones (CST art. 186: 15 días hábiles por año) ---------- */
  function vacacionesCausadas(ingreso, hoy) { if (!ingreso) return 0; return Math.max(0, Math.round(diasEntre(ingreso, hoy) * 15 / 365 * 10) / 10); }
  function diasHabiles(desde, hasta, cfg, sabadoHabil) {
    var n = 0, f = desde; while (f <= hasta) { var w = dow(f); if (w !== 0 && !esFestivo(f, cfg) && (w !== 6 || sabadoHabil)) n++; f = sumar(f, 1); } return n;
  }

  /* ---------- Catálogo de permisos ---------- */
  var PERMISOS = [
    { id: 'cita_medica', cat: 'ley', nombre: 'Cita médica o de urgencia', norma: 'CST art. 57 num. 6 (Ley 2466 de 2025)', rem: true },
    { id: 'luto', cat: 'ley', nombre: 'Licencia de luto (5 días hábiles)', norma: 'Ley 1280 de 2009', rem: true },
    { id: 'paternidad', cat: 'ley', nombre: 'Licencia de paternidad', norma: 'Ley 2114 de 2021', rem: true },
    { id: 'maternidad', cat: 'ley', nombre: 'Licencia de maternidad', norma: 'CST art. 236', rem: true },
    { id: 'sufragio', cat: 'ley', nombre: 'Descanso por votar (media jornada)', norma: 'Ley 403 de 1997', rem: true },
    { id: 'jurado', cat: 'ley', nombre: 'Jurado de votación (1 día)', norma: 'Código Electoral art. 105', rem: true },
    { id: 'citacion', cat: 'ley', nombre: 'Citación judicial o administrativa', norma: 'CST art. 57 num. 6', rem: true },
    { id: 'escolar', cat: 'ley', nombre: 'Obligación escolar como acudiente', norma: 'CST art. 57 num. 6 (Ley 2466 de 2025)', rem: true },
    { id: 'cargo_oficial', cat: 'ley', nombre: 'Cargo oficial de forzosa aceptación', norma: 'CST art. 57 num. 6', rem: true },
    { id: 'sindical', cat: 'ley', nombre: 'Comisión sindical', norma: 'CST art. 57 num. 6', rem: true },
    { id: 'entierro', cat: 'ley', nombre: 'Entierro de un compañero', norma: 'CST art. 57 num. 6', rem: true },
    { id: 'familia', cat: 'acuerdo', nombre: 'Jornada de la familia', norma: 'Ley 1857 de 2017 (no obligatoria con jornada de 42 h: Ley 2101 de 2021)', rem: true },
    { id: 'bicicleta', cat: 'acuerdo', nombre: 'Día por uso de bicicleta', norma: 'Ley 1811 de 2016 · Ley 2466 de 2025 (según lo adopte la empresa)', rem: true },
    { id: 'calamidad', cat: 'calamidad', nombre: 'Calamidad doméstica', norma: 'CST art. 57 num. 6 · Sentencia C-930 de 2009', rem: true },
    { id: 'vacaciones', cat: 'vacaciones', nombre: 'Vacaciones', norma: 'CST art. 186', rem: true },
    { id: 'acuerdo_rem', cat: 'acuerdo', nombre: 'Permiso remunerado por acuerdo', norma: 'Acuerdo con el empleador', rem: true },
    { id: 'acuerdo_comp', cat: 'acuerdo', nombre: 'Permiso con reposición de tiempo', norma: 'Acuerdo con el empleador', rem: true },
    { id: 'personal', cat: 'voluntario', nombre: 'Permiso personal no remunerado', norma: 'CST art. 51 num. 4', rem: false }
  ];

  return { DEF: DEF, cfg: cfgDe, aMin: aMin, aHHMM: aHHMM, sumar: sumar, dow: dow, lunesDe: lunesDe, diasEntre: diasEntre, pascua: pascua,
    festivos: festivos, esFestivo: esFestivo, esDescanso: esDescanso, recDominical: recDominical, horarioDia: horarioDia, jornadaMin: jornadaMin,
    liquidarDia: liquidarDia, liquidarDias: liquidarDias, avisosExtras: avisosExtras, periodoDe: periodoDe, diasNomina: diasNomina,
    liquidarPeriodo: liquidarPeriodo, vacacionesCausadas: vacacionesCausadas, diasHabiles: diasHabiles, PERMISOS: PERMISOS, ultimoDia: ultimoDia };
})();



// ===================== Base.gs =====================
/**
 * CONTROL DE JORNADA — Backend en Google Apps Script sobre Google Sheets.
 * Base: acceso a datos, seguridad, configuración y enrutador de la API.
 * Una hoja de cálculo = una empresa. Nada de la empresa está escrito en el código: todo vive en la hoja Config.
 */
var VERSION = '1.6.1';
// Página publicada (GitHub Pages) que usan tus clientes. Déjala escrita en la plantilla para que el instalador entregue el enlace listo.
var APP_PREDETERMINADA = '';
// Clave secreta del proveedor para firmar llaves de licencia por plan/módulos. Si está vacía, todos los módulos quedan activos (modo demostración).
var CLAVE_LICENCIA_PROVEEDOR = '';
var PLANES = {
  basico: { maxUsuarios: 25, modulos: ['asistencia'] },
  profesional: { maxUsuarios: 80, modulos: ['asistencia', 'nomina', 'permisos', 'turnos', 'prestamos', 'autoservicio'] },
  empresa: { maxUsuarios: 150, modulos: ['asistencia', 'nomina', 'permisos', 'turnos', 'prestamos', 'autoservicio', 'kiosco', 'qr', 'presupuesto', 'tablero360', 'seguridadPro'] }
};
var _AHORA = null; // solo para pruebas

var HOJAS = {
  Config: ['clave', 'valor'],
  Usuarios: ['cedula', 'nombre', 'cargo', 'rol', 'centroId', 'salario', 'salarioOk', 'tipoPago', 'email', 'telefono', 'ingreso', 'eps', 'arl', 'estado', 'hash', 'salt', 'codigo', 'consVersion', 'consFecha', 'creado', 'supCentros', 'banco', 'tipoCuenta', 'cuenta', 'retiro', 'dispositivoId', 'fotoRef', 'tipoContrato', 'finContrato'],
  Sesiones: ['hash', 'cedula', 'creado', 'expira', 'equipo'],
  Centros: ['id', 'nombre', 'cliente', 'direccion', 'lat', 'lng', 'radio', 'horario', 'tol', 'festivos', 'activo', 'poligono', 'exigirQr', 'presupuestoHoras', 'presupuestoCosto'],
  Jefes: ['id', 'nombre', 'cargo', 'email', 'whatsapp', 'pin', 'centros', 'activo'],
  Marcaciones: ['id', 'cedula', 'fecha', 'tipo', 'hora', 'servidor', 'lat', 'lng', 'prec', 'dist', 'enZona', 'centroId', 'foto', 'fotoExigida', 'manual', 'motivo', 'estado', 'horario', 'origen', 'editadoPor'],
  Permisos: ['id', 'cedula', 'tipo', 'cat', 'remunerado', 'fechaSalida', 'horaSalida', 'fechaRegreso', 'horaRegreso', 'motivo', 'soporte', 'estado', 'creado', 'limite', 'firmas', 'decididoPor', 'decididoEl', 'obs'],
  Incapacidades: ['id', 'cedula', 'tipo', 'desde', 'hasta', 'entidad', 'nota', 'soporte', 'registradoPor', 'creado'],
  Extras: ['id', 'cedula', 'fecha', 'minCalc', 'minAprob', 'estado', 'decididoPor', 'decididoEl', 'obs'],
  Nomina: ['id', 'desde', 'hasta', 'cedula', 'nombre', 'neto', 'detalle', 'generado', 'acuse'],
  Periodos: ['desde', 'hasta', 'cerradoPor', 'cerradoEl'],
  Novedades: ['id', 'cedula', 'fecha', 'concepto', 'valor', 'salarial', 'nota', 'creadoPor', 'creado'],
  Turnos: ['id', 'nombre', 'e', 's', 'ai', 'af', 'dias', 'activo'],
  Programacion: ['id', 'cedula', 'desde', 'hasta', 'turnoId', 'creadoPor', 'creado'],
  Alertas: ['fecha', 'tipo', 'cedula', 'detalle', 'enviadoA', 'estado'],
  Auditoria: ['fecha', 'actor', 'accion', 'detalle', 'hash'],
  Errores: ['fecha', 'cedula', 'origen', 'mensaje', 'detalle', 'equipo', 'version'],
  Prestamos: ['id', 'cedula', 'concepto', 'monto', 'cuotas', 'cuotaValor', 'pagadas', 'saldo', 'estado', 'creadoPor', 'creado'],
  Compensatorios: ['id', 'cedula', 'fecha', 'minutos', 'tipo', 'motivo', 'creadoPor', 'creado'],
  Comunicados: ['id', 'titulo', 'cuerpo', 'centros', 'creadoPor', 'creado', 'leidos']
};

var TIPOS_ALERTA = {
  tardanza: 'Llegada tarde', ausencia: 'No se presentó', fuera_zona: 'Marcación fuera del centro de trabajo',
  marcacion_manual: 'Marcación con hora digitada', bloqueo_permisos: 'Bloqueó la ubicación o la cámara', sin_foto: 'Marcación sin la foto exigida',
  incompleto: 'Jornada sin salida', permiso_nuevo: 'Nueva solicitud de permiso', permiso_vencido: 'Permiso sin respuesta a tiempo',
  permiso_resuelto: 'Permiso aprobado o rechazado', extras_tope: 'Horas extra por encima del tope legal', extras_pendientes: 'Horas extra por aprobar',
  fatiga: 'Jornada continua cerca del máximo (fatiga)', seguridad: 'Intentos de acceso sospechosos', registro_nuevo: 'Nuevo usuario por aprobar', respaldo: 'Resultado de la copia de seguridad', error_sistema: 'Error del sistema', contrato_vencimiento: 'Contrato próximo a vencer', gps_sospechoso: 'Ubicación sospechosa (posible GPS falso)', presupuesto_obra: 'Alerta de presupuesto de obra'
};

var CFG_DEF = {
  empresa: { nombre: 'Mi empresa', nit: '', direccion: '', telefono: '', logo: '', color: '', correoDatos: '', responsableDatos: '', titularSoftware: '' },
  urlApp: '', zona: 'America/Bogota', periodoNomina: 'quincenal',
  fotoProbabilidad: 30, geocercaEstricta: false, soloCentroAsignado: false, maxPrecisionGps: 120, qrVentanaSeg: 60, fotoEnAnomalia: true, radioDefecto: 150, toleranciaMin: 5, recordatorioMin: 5, recordatorioCorreo: false,
  factorPrestacional: 0, fatigaHorasMax: 10, fatigaAvisoMin: 30, codigosConcepto: {},
  minutosAusencia: 60, diasAtrasManual: 3, horasLimitePermiso: 24, aprobacionFinalAdmin: true,
  autoRegistro: true, codigoEmpresa: '', sesionDias: 90, sesionAdminHoras: 24, admin2FA: false,
  correoAlertas: '', alertas: {},
  retencionFotosDias: 30, retencionGpsDias: 365, retencionSoportesDias: 365, archivarMeses: 12, respaldoCadaDias: 7, respaldoConservar: 8,
  vincularDispositivo: false, alertasAgrupadas: false, telegramToken: '', telegramChatId: '',
  contactosEmergencia: [],
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
function igualSeguro_(a, b) {
  a = String(a || ''); b = String(b || '');
  var d = a.length ^ b.length, len = Math.max(a.length, b.length);
  for (var i = 0; i < len; i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}
function hashClave_(clave, salt) { var h = salt + '|' + clave; for (var i = 0; i < 150; i++) h = sha_(h + salt); return h; }
function hashClaveV2_(clave, salt) { var h = hmac_(salt + '|' + clave); for (var i = 0; i < 2000; i++) h = hmac_(h + '|' + salt); return 'v2:' + h; }
function verificarClave_(clave, salt, hash) { if (!hash) return false; return String(hash).indexOf('v2:') === 0 ? igualSeguro_(hashClaveV2_(clave, salt), hash) : igualSeguro_(hashClave_(clave, salt), hash); }
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
function enPoligono_(lat, lng, poly) {
  if (!Array.isArray(poly) || poly.length < 3) return false;
  var dentro = false;
  for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    var xi = +poly[i][0], yi = +poly[i][1], xj = +poly[j][0], yj = +poly[j][1];
    if (((yi > lng) !== (yj > lng)) && (lat < (xj - xi) * (lng - yi) / ((yj - yi) || 1e-12) + xi)) dentro = !dentro;
  }
  return dentro;
}
function codigoQrCentro_(centroId, ventana) { return hmac_('qr|' + centroId + '|' + ventana).substr(0, 6).toUpperCase(); }
function codigoDiaCentro_(centroId, fecha) { return hmac_('qrdia|' + centroId + '|' + fecha).substr(0, 6).toUpperCase(); }
function validarQrCentro_(centroId, entrada) {
  var raw = txt_(entrada, 80).toUpperCase(); if (!raw) return false;
  var a = ahora_(), seg = Math.max(30, +cfg_().qrVentanaSeg || 60), w = Math.floor(a.ms / (seg * 1000));
  if (raw === codigoDiaCentro_(centroId, a.fecha)) return true;
  var cod = raw.indexOf('CJ:') === 0 ? raw.split(':').pop() : raw;
  return cod === codigoQrCentro_(centroId, w) || cod === codigoQrCentro_(centroId, w - 1);
}
// Contador de FALLOS (no de intentos): bloquea adivinar claves aunque el atacante cambie de cédula o de permiso.
function fallo_(clave, seg) { var c = CacheService.getScriptCache(), k = 'fl:' + clave, n = +(c.get(k) || 0) + 1; c.put(k, String(n), seg); return n; }
function bloqueado_(clave, max) { if (+(CacheService.getScriptCache().get('fl:' + clave) || 0) >= max) throw E_('DEMASIADOS', 'Demasiados intentos fallidos. Espera un rato e intenta de nuevo.'); }
function claveDebil_(clave, cedula) { clave = String(clave || ''); return clave.length < 6 || clave === cedula || /^(\d)\1+$/.test(clave) || ['123456', '1234567', '12345678', '123456789', '654321', 'abcdef', 'qwerty', 'password', 'colombia', 'abc123', '111222', '123123'].indexOf(clave.toLowerCase()) >= 0; }
function codigoLargo_() { var a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = azar_(), r = ''; for (var i = 0; i < 8; i++) r += a.charAt(parseInt(s.substr(i * 2, 2), 16) % a.length); return r; }
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
  return v === '' ? '' : "'" + v; // el apóstrofo obliga a Sheets a guardar texto literal: ni fechas, ni números, ni fórmulas
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
function auditar_(actor, accion, detalle) {
  var fecha = ahora_().iso, det = txt_(typeof detalle === 'string' ? detalle : JSON.stringify(detalle), 2000);
  var prev = leer('Auditoria', 1), ant = prev.length ? (prev[0].hash || '') : 'GENESIS';
  var h = hmac_(ant + '|' + fecha + '|' + actor + '|' + accion + '|' + det).substr(0, 32);
  agregar('Auditoria', { fecha: fecha, actor: actor, accion: accion, detalle: det, hash: h });
}
function correo_(para, asunto, cuerpo) {
  para = String(para || '').split(/[,; ]+/).filter(function (x) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x); });
  if (!para.length) return '';
  try {
    if (MailApp.getRemainingDailyQuota() < para.length) return 'SIN CUPO DE CORREO';
    MailApp.sendEmail({ to: para.join(','), subject: '[' + cfg_().empresa.nombre + '] ' + asunto, body: cuerpo + '\n\n— Control de jornada · mensaje automático', name: cfg_().empresa.nombre });
    return para.join(',');
  } catch (e) { return 'FALLÓ: ' + e.message; }
}
function telegram_(texto) {
  var c = cfg_(), tok = prop_('TELEGRAM_TOKEN') || c.telegramToken; if (!tok || !c.telegramChatId) return;
  try {
    UrlFetchApp.fetch('https://api.telegram.org/bot' + tok + '/sendMessage', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({ chat_id: c.telegramChatId, text: '[' + c.empresa.nombre + '] ' + texto })
    });
  } catch (e) { /* no interrumpir por fallo de Telegram */ }
}
var ALERTAS_AGRUPABLES = { tardanza: 1, ausencia: 1, fuera_zona: 1, marcacion_manual: 1, sin_foto: 1 };
function alertar_(tipo, cedula, detalle) {
  var c = cfg_(), a = (c.alertas || {})[tipo] || {}, activo = a.activo !== false, para = a.correos || c.correoAlertas, enviado = '';
  var diferida = activo && para && c.alertasAgrupadas && ALERTAS_AGRUPABLES[tipo];
  var u = cedula ? buscar('Usuarios', 'cedula', cedula) : null;
  if (activo && !diferida) telegram_((TIPOS_ALERTA[tipo] || tipo) + (u ? ' — ' + u.nombre : '') + '\n' + detalle);
  if (activo && para && !diferida) {
    enviado = correo_(para, TIPOS_ALERTA[tipo] + (u ? ': ' + u.nombre : ''), (u ? u.nombre + ' (C.C. ' + cedula + ')\n' : '') + detalle + '\n\nFecha: ' + ahora_().iso.replace('T', ' '));
  }
  agregar('Alertas', { fecha: ahora_().iso, tipo: tipo, cedula: cedula || '', detalle: txt_(detalle, 500), enviadoA: diferida ? para : enviado, estado: !activo ? 'desactivada' : diferida ? 'pendiente_resumen' : enviado && enviado.indexOf('@') > 0 ? 'enviada' : 'registrada' });
}
function registrarError_(origen, err, extra) {
  try {
    agregar('Errores', { fecha: ahora_().iso, cedula: (extra && extra.cedula) || '', origen: origen, mensaje: txt_(err && err.message ? err.message : err, 400), detalle: txt_(err && err.stack ? err.stack : (extra && extra.detalle) || '', 1500), equipo: txt_(extra && extra.equipo, 200), version: (extra && extra.version) || VERSION });
  } catch (e) { /* nunca romper por registrar */ }
}

/* ---------- Sesiones ---------- */
function crearSesion_(cedula, equipo, rol) {
  var t = azar_(), a = ahora_(), c = cfg_();
  var ttl = rol === 'admin' ? Math.max(1, +c.sesionAdminHoras || 24) * 3600000 : c.sesionDias * 86400000;
  agregar('Sesiones', { hash: sha_(t), cedula: cedula, creado: a.iso, expira: String(a.ms + ttl), equipo: txt_(equipo, 120) });
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
    email: u.email, telefono: u.telefono, ingreso: String(u.ingreso).substr(0, 10), eps: u.eps, arl: u.arl, estado: u.estado, retiro: String(u.retiro || '').substr(0, 10), supCentros: json_(u.supCentros, []), banco: u.banco || '', tipoCuenta: u.tipoCuenta || '', cuenta: u.cuenta || '', consVersion: String(u.consVersion).indexOf(cfg_().versionLegal) === 0 ? cfg_().versionLegal : u.consVersion, tieneClave: !!u.hash, tieneDispositivo: !!u.dispositivoId, tieneFotoRef: !!u.fotoRef, tipoContrato: u.tipoContrato || '', finContrato: String(u.finContrato || '').substr(0, 10) };
}

/* ---------- Licenciamiento por plan y módulos ---------- */
function licenciaEfectiva_() {
  var def = { plan: 'empresa', modulos: PLANES.empresa.modulos.slice(), maxUsuarios: PLANES.empresa.maxUsuarios, vence: '', vencida: false };
  var raw = prop_('LICENCIA');
  if (!raw) return CLAVE_LICENCIA_PROVEEDOR ? { plan: 'basico', modulos: PLANES.basico.modulos.slice(), maxUsuarios: PLANES.basico.maxUsuarios, vence: '', vencida: false } : def;
  var partes = String(raw).split('.');
  if (partes.length !== 2) return def;
  if (CLAVE_LICENCIA_PROVEEDOR) {
    var firma = hex_(Utilities.computeHmacSha256Signature(partes[0], CLAVE_LICENCIA_PROVEEDOR)).substr(0, 32);
    if (!igualSeguro_(firma, partes[1])) return { plan: 'basico', modulos: PLANES.basico.modulos.slice(), maxUsuarios: PLANES.basico.maxUsuarios, vence: '', vencida: true };
  }
  try {
    var datos = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(partes[0])).getDataAsString('UTF-8'));
    var base = PLANES[datos.plan] || PLANES.basico;
    var mods = base.modulos.slice();
    (datos.modulosExtra || []).forEach(function (m) { if (mods.indexOf(m) < 0) mods.push(m); });
    var vence = String(datos.vence || '').substr(0, 10);
    var vencida = !!(vence && /^\d{4}-\d\d-\d\d$/.test(vence) && ahora_().fecha > vence);
    return { plan: datos.plan || 'basico', modulos: vencida ? ['asistencia'] : mods, maxUsuarios: +datos.maxUsuarios || base.maxUsuarios, vence: vence, vencida: vencida };
  } catch (e) { return def; }
}
function moduloActivo_(mod) { return !mod || licenciaEfectiva_().modulos.indexOf(mod) >= 0; }

/* ---------- Enrutador ---------- */
var ACCIONES = {}; // nombre -> {fn, rol: 'publico' | 'usuario' | 'admin', escribe, modulo}
function accion_(nombre, rol, escribe, fn, modulo) { ACCIONES[nombre] = { fn: fn, rol: rol, escribe: escribe, modulo: modulo || '' }; }

var ACCIONES_SIEMPRE = { publico: 1, consultarCedula: 1, login: 1, salir: 1, yo: 1, adminLicenciaActivar: 1 };
function despachar_(req) {
  _c = {}; _cfg = null;
  if (!ACCIONES.publico) registrarAcciones_();
  var a = ACCIONES[req && req.a];
  if (!a) throw E_('ACCION', 'Acción desconocida.');
  if (CLAVE_LICENCIA_PROVEEDOR && !ACCIONES_SIEMPRE[req.a]) {
    var lic = licenciaEfectiva_();
    if (lic.vencida) throw E_('LICENCIA_VENCIDA', 'La suscripción de esta empresa está vencida. Renueva tu plan e ingresa la nueva llave de licencia para continuar.');
  }
  if (a.modulo && !moduloActivo_(a.modulo)) throw E_('MODULO_NO_INCLUIDO', 'El módulo "' + a.modulo + '" no está incluido en tu plan actual.');
  var lock = null;
  if (a.escribe) { lock = LockService.getScriptLock(); if (!lock.tryLock(25000)) throw E_('OCUPADO', 'El sistema está ocupado. Intenta de nuevo en unos segundos.'); }
  try {
    var u = null;
    if (a.rol !== 'publico') {
      u = usuarioDeToken_(req.t);
      if (a.rol === 'supervisor' && (['admin', 'supervisor'].indexOf(u.rol) < 0 || u.estado !== 'activo')) throw E_('PERMISO', 'Esta acción es solo para supervisores y administradores.');
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
function html_(t) { return String(t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
// Al abrir la dirección /exec en el navegador: termina la instalación si faltaba y entrega el enlace de conexión.
function doGet() {
  _c = {}; _cfg = null;
  var estado = 'Servicio activo.', instalado = !!prop_('SECRETO') && prop_('SS_ID') === SpreadsheetApp.getActiveSpreadsheet().getId();
  if (!instalado) { try { instalar(); instalado = true; estado = 'Instalación completada.'; } catch (e) { estado = 'No se pudo instalar: ' + e.message + '. Abre la hoja de cálculo y usa el menú Control de jornada → Instalar o reparar.'; } }
  var hayAdmin = false, e0 = enlaceEmpresa_(), enlace = e0.enlace, id = e0.id, url = e0.url;
  try { hayAdmin = leer('Usuarios').some(function (u) { return u.rol === 'admin' && u.hash; }); } catch (e) { }
  var h = '<div style="font-family:system-ui,sans-serif;max-width:560px;margin:32px auto;padding:0 16px;line-height:1.5;color:#14242A">' +
    '<h1 style="font-size:22px">Control de jornada · versión ' + VERSION + '</h1><p>' + html_(estado) + '</p>' +
    (enlace ? '<p><strong>Enlace de tu empresa</strong> (ábrelo y compártelo con tu personal):</p><p><a href="' + html_(enlace) + '" target="_blank" style="word-break:break-all">' + html_(enlace) + '</a></p>'
      : '<p><strong>Código de conexión</strong> (pégalo en la página de la aplicación):</p><p style="word-break:break-all;background:#E8EDEC;padding:12px;border-radius:8px;font-family:monospace">' + html_(id || url) + '</p>') +
    (hayAdmin ? '' : '<p>Primer ingreso: el <strong>código del primer administrador</strong> está en la hoja de cálculo, menú <em>Control de jornada → Ver código del primer administrador</em>. Por seguridad no se muestra aquí.</p>') + '</div>';
  return HtmlService.createHtmlOutput(h).setTitle('Control de jornada');
}


// ===================== Servicios.gs =====================
/**
 * CONTROL DE JORNADA — Servicios de la API.
 */
var TIPOS = ['entrada', 'sal_alm', 'ent_alm', 'salida'];
var NOMBRE_TIPO = { entrada: 'Entrada', sal_alm: 'Salida a almuerzo', ent_alm: 'Regreso de almuerzo', salida: 'Salida' };

/* ---------- Alcance por rol: el supervisor solo ve las personas de sus centros ---------- */
function alcance_(u) { // null = todo (administrador o llamada interna)
  if (!u || u.rol === 'admin') return null;
  var l = json_(u.supCentros, []), m = {}; if (!l.length && u.centroId) l = [u.centroId];
  l.forEach(function (x) { m[x] = 1; }); return m;
}
function enAlcance_(u, cedula) { var a = alcance_(u); if (!a) return true; var p = buscar('Usuarios', 'cedula', cedula); return !!(p && a[p.centroId]); }

/* ---------- Lecturas comunes ---------- */
function centros_() {
  return leer('Centros').map(function (c) {
    return { _f: c._f, id: c.id, nombre: c.nombre, cliente: c.cliente, direccion: c.direccion, lat: c.lat === '' ? null : +c.lat, lng: c.lng === '' ? null : +c.lng,
      radio: +c.radio || cfg_().radioDefecto, horario: json_(c.horario, {}), tol: c.tol === '' ? cfg_().toleranciaMin : +c.tol, festivos: c.festivos === '1', activo: c.activo !== '0', poligono: json_(c.poligono, []), exigirQr: c.exigirQr === '1', presupuestoHoras: +c.presupuestoHoras || 0, presupuestoCosto: +c.presupuestoCosto || 0 };
  });
}
function centroDe_(id) { var l = centros_(); for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
function centroPub_(c) { var o = {}; ['id', 'nombre', 'cliente', 'direccion', 'lat', 'lng', 'radio', 'horario', 'tol', 'festivos', 'activo', 'poligono', 'exigirQr', 'presupuestoHoras', 'presupuestoCosto'].forEach(function (k) { o[k] = c[k]; }); return o; }
// Turno programado para una persona en una fecha: undefined = sin programación (rige el horario del centro), null = descanso.
function turnoDe_(cedula, fecha) {
  var pr = leer('Programacion'), r = null;
  for (var i = 0; i < pr.length; i++) if (pr[i].cedula === cedula && pr[i].desde <= fecha && fecha <= pr[i].hasta) r = pr[i]; // gana la más reciente
  if (!r) return undefined;
  if (r.turnoId === 'descanso') return null;
  var t = buscar('Turnos', 'id', r.turnoId); if (!t || !t.e || !t.s) return undefined;
  var dias = json_(t.dias, []); if (dias.length && dias.indexOf(Motor.dow(fecha)) < 0) return null;
  return { e: t.e, s: t.s, ai: t.ai || '', af: t.af || '' };
}
function horarioDe_(centro, fecha, cedula) {
  if (cedula) { var t = turnoDe_(cedula, fecha); if (t !== undefined) { if (t) t.tol = centro ? centro.tol : cfg_().toleranciaMin; return t; } }
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
// Un día trabajado sin horario programado (el sábado de quien trabaja de lunes a viernes) es todo tiempo suplementario.
function marcarLibres_(dias, u) {
  var c = u ? centroDe_(u.centroId) : null, tiene = !!(c && Object.keys(c.horario).length);
  dias.forEach(function (d) { if (!d.horario && u) { var t = turnoDe_(u.cedula, d.fecha); d.libre = t === null || (t === undefined && tiene); } });
  return dias;
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
  var prog = {}; if (leer('Programacion').some(function (x) { return x.cedula === u.cedula; })) for (var pf = desde; pf <= hasta; pf = Motor.sumar(pf, 1)) { var pt = turnoDe_(u.cedula, pf); if (pt !== undefined) prog[pf] = !!pt; }
  var nov = leer('Novedades').filter(function (n) { return n.cedula === u.cedula; }).map(function (n) { return { fecha: n.fecha, concepto: n.concepto, valor: +n.valor || 0, salarial: n.salarial === '1' }; });
  return { programado: prog, novedades: nov, retiro: String(u.retiro || '').substr(0, 10), usuario: { salario: +u.salario || 0, tipoPago: u.tipoPago || 'mensual' }, desde: desde, hasta: hasta, corte: corte, ingreso: u.ingreso || '',
    dias: marcarLibres_(diasDe_(marc, u.cedula, Motor.lunesDe(desde), hasta), u), extras: ext, horario: centro ? centro.horario : null, trabajaFestivos: centro ? centro.festivos : false,
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
  return { fecha: fecha, marcas: marcas, siguiente: sig, fotoPlan: plan, horario: (hoy && hoy.horario) || horarioDe_(centro, fecha, u.cedula), centroId: centro ? centro.id : '', festivo: Motor.esFestivo(fecha, legal_()) };
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
  bloqueado_('regcod', 30);
  var clave = String(d.clave || ''); if (claveDebil_(clave, ced)) throw E_('DATOS', 'Elige una contraseña de al menos 6 caracteres que no sea tu cédula ni una secuencia fácil (como 123456).');
  var cons = d.consentimiento || {};
  if (!cons.datos || !cons.sensibles) throw E_('CONSENTIMIENTO', 'Para usar la aplicación debes autorizar el tratamiento de tus datos.');
  var cod = txt_(d.codigo, 40), u = buscar('Usuarios', 'cedula', ced), salario = Math.max(0, Math.round(+d.salario || 0));
  if (u && u.hash) throw E_('EXISTE', 'Esta cédula ya tiene contraseña. Ingresa con ella.');
  if (u && u.estado === 'inactivo') throw E_('PERMISO', 'Tu usuario está inactivo. Habla con el administrador.');
  var salt = azar_().substr(0, 16), rol = 'trabajador', estado = 'activo', codAdmin = prop_('CODIGO_ADMIN');
  if (codAdmin && cod === codAdmin) { rol = 'admin'; prop_('CODIGO_ADMIN', null); }
  else if (u) { if (!u.codigo || u.codigo !== hmac_('act|' + ced + '|' + cod)) { fallo_('regcod', 3600); throw E_('CODIGO', 'El código de activación no coincide. Pídelo al administrador.'); } rol = u.rol || 'trabajador'; }
  else {
    if (!c.autoRegistro) throw E_('CODIGO', 'Tu cédula aún no está cargada. Pide al administrador que te registre.');
    if (!c.codigoEmpresa || cod.toUpperCase() !== String(c.codigoEmpresa).toUpperCase()) { if (fallo_('regcod', 3600) === 30) alertar_('seguridad', '', 'Se acumularon 30 códigos de registro errados en una hora. El registro quedó bloqueado temporalmente.'); throw E_('CODIGO', 'El código de la empresa no coincide.'); }
    estado = 'pendiente';
  }
  var base = u || { cedula: ced, creado: a.iso, tipoPago: 'mensual' };
  base.nombre = base.nombre || txt_(d.nombre, 80); if (!base.nombre) throw E_('DATOS', 'Escribe tu nombre completo.');
  base.rol = rol; base.estado = estado; base.hash = hashClaveV2_(clave, salt); base.salt = salt; base.codigo = '';
  if (c.vincularDispositivo && d.dispositivoId) base.dispositivoId = txt_(d.dispositivoId, 80);
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
  var ced = soloDigitos_(d.cedula); limite_('login:' + ced, 30, 900); bloqueado_('lg:' + ced, 8); bloqueado_('login', 120);
  var u = buscar('Usuarios', 'cedula', ced);
  if (!u || !u.hash || !verificarClave_(String(d.clave || ''), u.salt, u.hash)) {
    fallo_('lg:' + ced, 900);
    if (fallo_('login', 600) === 30) alertar_('seguridad', '', 'Hubo 30 ingresos fallidos en 10 minutos desde distintas cédulas. Puede ser un intento de adivinar contraseñas.');
    throw E_('CREDENCIALES', 'La cédula o la contraseña no coinciden.');
  }
  if (u.estado === 'inactivo') throw E_('PERMISO', 'Tu usuario está inactivo. Habla con el administrador.');
  var c = cfg_(), dev = txt_(d.dispositivoId, 80), cambio = false;
  if (c.vincularDispositivo && u.rol === 'trabajador') {
    if (u.dispositivoId && dev && u.dispositivoId !== dev) {
      alertar_('seguridad', u.cedula, 'Intento de ingreso desde un celular distinto al vinculado.');
      throw E_('DISPOSITIVO', 'Tu cuenta está vinculada a otro celular. Pide al administrador que autorice el cambio de equipo.');
    }
    if (!u.dispositivoId && dev) { u.dispositivoId = dev; cambio = true; }
  }
  if (c.admin2FA && u.rol === 'admin' && u.email) {
    var cch2 = CacheService.getScriptCache(), k2 = '2fa:' + u.cedula, esperado = cch2.get(k2);
    if (!d.codigo2fa) {
      var cod2 = codigo6_(); cch2.put(k2, cod2, 300);
      correo_(u.email, 'Código de verificación de ingreso', 'Tu código de un solo uso para ingresar como administrador es: ' + cod2 + '\n\nVence en 5 minutos.');
      throw E_('2FA_REQUERIDO', 'Enviamos un código de verificación de 6 dígitos a tu correo.');
    }
    if (!esperado || !igualSeguro_(String(d.codigo2fa).trim(), esperado)) {
      fallo_('lg:' + ced, 900);
      throw E_('CREDENCIALES', 'El código de verificación no coincide o ya venció.');
    }
    cch2.remove(k2);
  }
  if (String(u.hash).indexOf('v2:') !== 0) { u.hash = hashClaveV2_(String(d.clave || ''), u.salt); cambio = true; } // migración transparente a v2
  if (cambio) guardar('Usuarios', u);
  CacheService.getScriptCache().remove('rl:login:' + ced);
  return { token: crearSesion_(ced, d.equipo, u.rol), usuario: usuarioPublico_(u) };
}
function a_salir(d, u, req) { cerrarSesiones_(u.cedula, sha_(String(req.t))); return {}; }
function a_salirTodas(d, u) { cerrarSesiones_(u.cedula); auditar_(u.cedula, 'cerrar_todas_sesiones', ''); return { ok: true }; }
function a_cambiarClave(d, u, req) {
  if (!verificarClave_(String(d.actual || ''), u.salt, u.hash)) throw E_('CREDENCIALES', 'La contraseña actual no coincide.');
  if (claveDebil_(d.nueva, u.cedula)) throw E_('DATOS', 'Elige una contraseña de al menos 6 caracteres que no sea tu cédula ni una secuencia fácil.');
  u.salt = azar_().substr(0, 16); u.hash = hashClaveV2_(String(d.nueva), u.salt); guardar('Usuarios', u);
  var mia = sha_(String(req.t)), cch = CacheService.getScriptCache(); // cierra las demás sesiones
  leer('Sesiones').filter(function (s) { return s.cedula === u.cedula && s.hash !== mia; }).sort(function (x, y) { return y._f - x._f; }).forEach(function (s) { cch.remove('ses:' + s.hash); borrar('Sesiones', s); }); auditar_(u.cedula, 'cambio_clave', ''); return {};
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
  var c = cfg_(), a = ahora_(), marc = leer('Marcaciones', 30000);
  if (u.rol === 'admin' && !c.urlApp && /^https:\/\//.test(d.base || '')) cfgSet_('urlApp', txt_(d.base, 200));
  var o = { usuario: usuarioPublico_(u), ahora: a.iso, version: VERSION, licencia: licenciaEfectiva_(),
    cfg: { empresa: c.empresa, versionLegal: c.versionLegal, recordatorioMin: c.recordatorioMin, periodoNomina: c.periodoNomina, diasAtrasManual: c.diasAtrasManual, geocercaEstricta: c.geocercaEstricta, horasLimitePermiso: c.horasLimitePermiso },
    centros: centros_().filter(function (x) { return x.activo; }).map(centroPub_), permisosCat: Motor.PERMISOS };
  if (u.estado !== 'activo') { o.centros = []; return o; } // sin aprobar no se entregan datos de la empresa
  o.hoy = estadoHoy_(u, marc); o.resumen = resumen_(u, marc);
  var tomadas = 0; leer('Permisos').forEach(function (p) { if (p.cedula === u.cedula && p.tipo === 'vacaciones' && p.estado === 'aprobado') tomadas += Motor.diasHabiles(p.fechaSalida, Motor.sumar(p.fechaRegreso, -1), legal_(), false); });
  o.vacaciones = { causadas: Motor.vacacionesCausadas(u.ingreso, a.fecha), tomadas: tomadas };
  return o;
}

/* ---------- Marcaciones ---------- */
function a_marcar(d, u) {
  if (u.estado !== 'activo') throw E_('PERMISO', 'Tu usuario aún no ha sido aprobado por el administrador.');
  var c = cfg_(), a = ahora_(), tipo = d.tipo, marc = leer('Marcaciones', 30000);
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
  if (fecha !== hora.substr(0, 10) && fecha !== Motor.sumar(hora.substr(0, 10), -1)) throw E_('DATOS', 'El día de la jornada no corresponde con la hora indicada.');
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
  // Centro, geocerca (polígono o radio), QR dinámico y detección anti-spoofing
  var prec = Math.round(+d.prec || 0);
  if (!manual && +c.maxPrecisionGps > 0 && prec > +c.maxPrecisionGps) throw E_('GPS_IMPRECISO', 'La señal GPS es muy imprecisa (' + prec + ' m). Muévete a un lugar despejado e intenta de nuevo.');
  var centro = (c.soloCentroAsignado && u.centroId) ? centroDe_(u.centroId) : (centroDe_(txt_(d.centroId, 20)) || centroDe_(u.centroId));
  var dist = '', enZona = '', sospechoso = !!d.gpsSospechoso, motivoSosp = sospechoso ? 'Lectura GPS repetida o sintética.' : '';
  if (centro && centro.exigirQr && !manual && !validarQrCentro_(centro.id, d.qrCodigo)) {
    throw E_('QR_REQUERIDO', 'Este centro exige escanear el código QR o ingresar el código del día vigente.');
  }
  if (centro && centro.poligono && centro.poligono.length >= 3) {
    if (centro.lat !== null && centro.lng !== null) dist = distancia_(lat, lng, centro.lat, centro.lng);
    enZona = enPoligono_(lat, lng, centro.poligono) ? '1' : '0';
  } else if (centro && centro.lat !== null && centro.lng !== null) {
    dist = distancia_(lat, lng, centro.lat, centro.lng); enZona = dist <= centro.radio + Math.min(prec, 50) ? '1' : '0';
  }
  if (enZona === '0' && c.geocercaEstricta && !manual) throw E_('FUERA_ZONA', 'Estás fuera de ' + centro.nombre + (dist !== '' ? ' (a ' + dist + ' m)' : '') + '. Acércate al centro de trabajo para marcar.');
  // Velocidad imposible respecto a la marcación anterior del mismo día
  if (dia && dia.marcas && dia.marcas.length) {
    var ultM = null;
    for (var mi = dia.marcas.length - 1; mi >= 0; mi--) { if (dia.marcas[mi].lat !== '' && dia.marcas[mi].lng !== '') { ultM = dia.marcas[mi]; break; } }
    if (ultM) {
      var dPrev = distancia_(lat, lng, +ultM.lat, +ultM.lng), dtH = Math.abs(isoMs_(hora) - isoMs_(ultM.hora)) / 3600000;
      if (dPrev > 500 && dtH > 0 && (dPrev / 1000) / dtH > 150) { sospechoso = true; motivoSosp = 'Desplazamiento imposible: ' + dPrev + ' m en ' + Math.round(dtH * 60) + ' min.'; }
    }
  }
  // Foto aleatoria u obligatoria por anomalía
  var anomaliaFoto = c.fotoEnAnomalia && (enZona === '0' || sospechoso || prec > 60);
  var exigida = !manual && (fotoRequerida_(u.cedula, fecha, tipo) || anomaliaFoto), fotoId = '', estado = (manual || sospechoso) ? 'revisar' : 'ok';
  if (sospechoso) alertar_('gps_sospechoso', u.cedula, motivoSosp + ' (' + NOMBRE_TIPO[tipo] + ', ' + hora.replace('T', ' ') + ')');
  var tardio = offline && isoMs_(a.iso) - isoMs_(hora) > 20 * 60000; if (tardio) estado = 'revisar'; // llegó sin conexión con hora del celular: la revisa el administrador
  if (d.foto) fotoId = guardarImagen_(d.foto, u.cedula + '_' + hora.replace(/[:T]/g, '-') + '_' + tipo + '.jpg', 'CARPETA_FOTOS');
  else if (exigida) { if (!offline) throw E_('FOTO_REQUERIDA', 'Esta marcación pide una foto. Tómala para continuar.'); estado = 'revisar'; }
  var hor = (dia && dia.horario) || horarioDe_(centro, fecha, u.cedula);
  var fila = { id: mid, cedula: u.cedula, fecha: fecha, tipo: tipo, hora: hora, servidor: a.iso, lat: lat.toFixed(6), lng: lng.toFixed(6), prec: String(Math.round(+d.prec || 0)), dist: String(dist), enZona: enZona,
    centroId: centro ? centro.id : '', foto: fotoId, fotoExigida: exigida ? '1' : '', manual: manual ? '1' : '', motivo: manual ? txt_(d.motivo, 200) : '', estado: estado, horario: hor ? JSON.stringify(hor) : '', origen: manual ? 'manual' : offline ? 'sin_conexion' : 'en_linea', editadoPor: '' };
  agregar('Marcaciones', fila); fila._f = hoja_('Marcaciones').getLastRow(); marc.push(fila); _c['Marcaciones|30000'] = marc; // evita releer toda la hoja
  // Alertas
  if (tipo === 'entrada' && hor && Motor.aMin(hora.substr(11, 5)) > Motor.aMin(hor.e) + (+hor.tol || 0))
    alertar_('tardanza', u.cedula, 'Marcó entrada a las ' + hora.substr(11, 5) + ' (horario ' + hor.e + ')' + (centro ? ' en ' + centro.nombre : '') + '. Retraso: ' + (Motor.aMin(hora.substr(11, 5)) - Motor.aMin(hor.e)) + ' min.');
  if (enZona === '0') alertar_('fuera_zona', u.cedula, NOMBRE_TIPO[tipo] + ' a ' + dist + ' m de ' + centro.nombre + ' (radio permitido ' + centro.radio + ' m). Consulta la ubicación en el panel, sección Marcaciones.');
  if (tardio) alertar_('marcacion_manual', u.cedula, '"' + NOMBRE_TIPO[tipo] + '" del ' + fecha + ' a las ' + hora.substr(11, 5) + ' se registró sin conexión y llegó al servidor ' + Math.round((isoMs_(a.iso) - isoMs_(hora)) / 60000) + ' min después. La hora es la del celular: revísala.');
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
  var L = legal_(), lun = Motor.lunesDe(fecha), dom = Motor.sumar(lun, 6), liq = Motor.liquidarDias(marcarLibres_(diasDe_(marc || leer('Marcaciones', 30000), cedula, lun, dom), buscar('Usuarios', 'cedula', cedula)), L, null), sem = 0;
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
function a_permisoCrear(d, u, req, adm) {
  if (u.estado !== 'activo') throw E_('PERMISO', adm ? 'Esa persona no está activa.' : 'Tu usuario aún no ha sido aprobado.');
  var c = cfg_(), a = ahora_(), cat = Motor.PERMISOS.filter(function (x) { return x.id === d.tipo; })[0];
  if (!cat) throw E_('DATOS', 'Elige el tipo de permiso.');
  var re = /^\d{4}-\d\d-\d\d$/, rh = /^\d\d:\d\d$/;
  if (!re.test(d.fechaSalida || '') || !re.test(d.fechaRegreso || '')) throw E_('DATOS', 'Completa la fecha de salida y la de regreso.');
  if (d.fechaRegreso < d.fechaSalida) throw E_('DATOS', 'El regreso no puede ser antes de la salida.');
  var hs = rh.test(d.horaSalida || '') ? d.horaSalida : '', hr = rh.test(d.horaRegreso || '') ? d.horaRegreso : '';
  if (d.fechaSalida === d.fechaRegreso) { if (!hs || !hr) throw E_('DATOS', 'Para un permiso dentro del mismo día indica hora de salida y de regreso.'); if (hr <= hs) throw E_('DATOS', 'La hora de regreso debe ser posterior a la de salida.'); }
  if (txt_(d.motivo, 500).length < 5) throw E_('DATOS', 'Escribe el motivo del permiso.');
  if (!adm && cat.cat !== 'calamidad' && d.fechaSalida < Motor.sumar(a.fecha, -c.diasAtrasManual)) throw E_('DATOS', 'La fecha de salida es demasiado antigua.');
  if (adm && periodoCerrado_(d.fechaSalida)) throw E_('CERRADO', 'La fecha pertenece a una nómina cerrada.');
  if (!adm) limite_('perm:' + u.cedula, 10, 3600);
  var pid = id_(), centro = u.centroId;
  var firmas = adm ? [] : jefes_().filter(function (j) { var cs = json_(j.centros, []); return !cs.length || cs.indexOf(centro) >= 0; })
    .map(function (j) { return { id: j.id, nombre: j.nombre, cargo: j.cargo, whatsapp: j.whatsapp, estado: 'pendiente', fecha: '', obs: '', firma: '' }; });
  var p = { id: pid, cedula: u.cedula, tipo: cat.id, cat: cat.cat, remunerado: cat.rem ? '1' : '', fechaSalida: d.fechaSalida, horaSalida: hs, fechaRegreso: d.fechaRegreso, horaRegreso: hr, motivo: txt_(d.motivo, 500),
    soporte: d.soporte ? guardarImagen_(d.soporte, 'soporte_' + u.cedula + '_' + pid + '.jpg', 'CARPETA_FOTOS') : '', estado: adm ? 'aprobado' : firmas.length ? 'en_firmas' : 'firmado', creado: a.iso,
    limite: String(a.ms + c.horasLimitePermiso * 3600000), firmas: JSON.stringify(firmas), decididoPor: adm ? adm.cedula : '', decididoEl: adm ? a.iso : '', obs: adm ? 'Registrado por la administración' + (d.obs ? ': ' + txt_(d.obs, 200) : '') : '' };
  if (adm && !cat.rem && d.remunerado) p.remunerado = '1';
  agregar('Permisos', p);
  if (adm) { auditar_(adm.cedula, 'permiso_registrado', { id: p.id, cedula: u.cedula, tipo: p.tipo, desde: p.fechaSalida, hasta: p.fechaRegreso }); return permisoPub_(p, false); }
  var resumen = cat.nombre + '\nSale: ' + p.fechaSalida + ' ' + hs + '\nRegresa: ' + p.fechaRegreso + ' ' + hr + '\nMotivo: ' + p.motivo;
  jefes_().forEach(function (j) { if (j.email && firmas.some(function (f) { return f.id === j.id; })) correo_(j.email, 'Permiso por firmar: ' + u.nombre, u.nombre + ' (C.C. ' + u.cedula + ') solicita:\n' + resumen + '\n\nFirma o rechaza aquí (necesitas tu clave de firma):\n' + enlaceFirma_(pid, j.id)); });
  alertar_('permiso_nuevo', u.cedula, resumen);
  return permisoPub_(p, true);
}
function a_adminPermisoRegistrar(d, adm) { var u = buscar('Usuarios', 'cedula', soloDigitos_(d.cedula)); if (!u) throw E_('DATOS', 'Elige la persona.'); return a_permisoCrear(d, u, null, adm); }
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
  limite_('fr:' + p.id + jid, 6, 900); bloqueado_('pin:' + jid, 5); // tope por permiso y, sobre todo, por jefe: crear más permisos no da más intentos
  var j = buscar('Jefes', 'id', jid);
  if (!j || j.activo === '0' || !j.pin || j.pin !== hmac_('pin|' + jid + '|' + String(d.pin || ''))) {
    if (fallo_('pin:' + jid, 21600) === 5) { alertar_('seguridad', p.cedula, 'Cinco claves de firma erradas para ' + (j ? j.nombre : jid) + '. Su firma queda bloqueada 6 horas. Último permiso intentado: el de esta persona.'); if (j && j.email) correo_(j.email, 'Intentaron usar tu clave de firma', 'Hubo cinco intentos fallidos de firmar permisos a tu nombre. Tu firma queda bloqueada 6 horas. Si no fuiste tú, pide al administrador una clave nueva.'); }
    throw E_('CREDENCIALES', 'La clave de firma no coincide.');
  }
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
function a_adminTablero(d, adm) {
  var al = alcance_(adm), enS = {}, a = ahora_(), L = legal_(), marc = leer('Marcaciones', 30000), ahoraMin = Motor.aMin(a.hora), filas = [], cuenta = { presente: 0, almuerzo: 0, salio: 0, ausente: 0, por_llegar: 0, permiso: 0, incapacidad: 0, descanso: 0, tarde: 0 };
  var incs = leer('Incapacidades'), cs = {}; centros_().forEach(function (c) { cs[c.id] = c; });
  leer('Usuarios').forEach(function (u) {
    if (u.estado !== 'activo' || (al && !al[u.centroId])) return; enS[u.cedula] = 1;
    var centro = cs[u.centroId], hor = horarioDe_(centro, a.fecha, u.cedula), d = diasDe_(marc, u.cedula, a.fecha, a.fecha)[0], est, tarde = 0;
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
  var res = { fecha: a.fecha, hora: a.hora, festivo: Motor.esFestivo(a.fecha, L), cuenta: cuenta, personas: filas,
    pendientes: { permisos: leer('Permisos').filter(function (p) { return p.estado === 'firmado' || p.estado === 'vencido'; }).length,
      enFirmas: leer('Permisos').filter(function (p) { return p.estado === 'en_firmas'; }).length,
      extras: leer('Extras').filter(function (x) { return x.estado === 'pendiente'; }).length,
      revisar: marc.filter(function (m) { return m.estado === 'revisar'; }).length,
      usuarios: leer('Usuarios').filter(function (u) { return u.estado === 'pendiente'; }).length,
      salarios: leer('Usuarios').filter(function (u) { return u.estado === 'activo' && u.salarioOk !== '1'; }).length } };
  if (al) res.pendientes = { permisos: 0, enFirmas: 0, usuarios: 0, salarios: 0,
    extras: leer('Extras').filter(function (x) { return x.estado === 'pendiente' && enS[x.cedula]; }).length, revisar: marc.filter(function (m) { return m.estado === 'revisar' && enS[m.cedula]; }).length };
  if (!al) { var cf = cfg_(), us = leer('Usuarios');
    res.pasos = { empresa: cf.empresa.nombre !== CFG_DEF.empresa.nombre, centros: centros_().length > 0, jefes: leer('Jefes').length > 0, alertas: !!cf.correoAlertas,
      personal: us.some(function (u) { return u.rol !== 'admin'; }), activos: us.some(function (u) { return u.rol !== 'admin' && u.hash; }) }; }
  res.rol = adm ? adm.rol : 'admin'; return res;
}

function a_adminPersonal() { return leer('Usuarios').map(usuarioPublico_); }
function a_adminPersonaGuardar(d, adm) {
  var ced = soloDigitos_(d.cedula); if (ced.length < 5 || ced.length > 12) throw E_('DATOS', 'La cédula no es válida.');
  var u = buscar('Usuarios', 'cedula', ced), nuevo = !u, cod = null;
  if (nuevo) {
    var activos = leer('Usuarios').filter(function (x) { return x.estado !== 'inactivo'; }).length, maxU = licenciaEfectiva_().maxUsuarios;
    if (activos >= maxU) throw E_('LIMITE_PLAN', 'Alcanzaste el límite de ' + maxU + ' personas de tu plan actual.');
    u = { cedula: ced, creado: ahora_().iso, estado: 'preregistrado', hash: '', salt: '' }; cod = codigo6_(); u.codigo = hmac_('act|' + ced + '|' + cod);
  }
  if (!txt_(d.nombre, 80)) throw E_('DATOS', 'Escribe el nombre.');
  u.nombre = txt_(d.nombre, 80); u.cargo = txt_(d.cargo, 60); u.rol = ['admin', 'supervisor'].indexOf(d.rol) >= 0 ? d.rol : 'trabajador'; u.centroId = txt_(d.centroId, 20);
  u.supCentros = JSON.stringify((d.supCentros || []).map(function (x) { return txt_(x, 20); }));
  u.banco = txt_(d.banco, 40); u.tipoCuenta = ['ahorros', 'corriente', ''].indexOf(d.tipoCuenta) >= 0 ? d.tipoCuenta || '' : ''; u.cuenta = soloDigitos_(d.cuenta).substr(0, 24);
  u.salario = Math.max(0, Math.round(+d.salario || 0)); u.salarioOk = u.salario ? '1' : ''; u.tipoPago = d.tipoPago === 'dia' ? 'dia' : 'mensual';
  u.email = txt_(d.email, 120); u.telefono = soloDigitos_(d.telefono).substr(0, 15); u.ingreso = /^\d{4}-\d\d-\d\d$/.test(d.ingreso || '') ? d.ingreso : ''; u.eps = txt_(d.eps, 60); u.arl = txt_(d.arl, 60);
  u.tipoContrato = ['indefinido', 'fijo', 'obra', 'aprendizaje', ''].indexOf(d.tipoContrato || '') >= 0 ? (d.tipoContrato || '') : '';
  u.finContrato = /^\d{4}-\d\d-\d\d$/.test(d.finContrato || '') ? d.finContrato : '';
  if (!nuevo && d.estado && ['activo', 'inactivo'].indexOf(d.estado) >= 0 && u.hash) {
    if (u.cedula === adm.cedula && d.estado === 'inactivo') throw E_('DATOS', 'No puedes desactivar tu propio usuario.');
    u.estado = d.estado; if (d.estado === 'inactivo') cerrarSesiones_(ced);
    u.retiro = d.estado === 'inactivo' ? (/^\d{4}-\d\d-\d\d$/.test(d.retiro || '') ? d.retiro : ahora_().fecha) : ''; // sin fecha de retiro se seguiría liquidando // la baja revoca el acceso de inmediato
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
    try { var ced = soloDigitos_(f.cedula); var ya = buscar('Usuarios', 'cedula', ced);
      if (ya) { var m = usuarioPublico_(ya); Object.keys(f).forEach(function (k) { if (f[k] !== '' && f[k] !== 0 && f[k] !== null) m[k] = f[k]; }); delete m.estado; a_adminPersonaGuardar(m, adm); res.push({ cedula: ced, nombre: m.nombre, resultado: 'Actualizada', codigo: '' }); return; }
      var r = a_adminPersonaGuardar(f, adm); res.push({ cedula: ced, nombre: r.usuario.nombre, resultado: 'Creada', codigo: r.codigo });
    } catch (e) { res.push({ cedula: f.cedula, nombre: f.nombre, resultado: 'Error: ' + e.message, codigo: '' }); }
  });
  return res;
}

function a_adminCentros(d, adm) { var al = alcance_(adm); return centros_().filter(function (c) { return !al || al[c.id]; }).map(centroPub_); }
function a_adminQrCentro(d, adm) {
  var c = centroDe_(txt_(d.centroId, 20)); if (!c) throw E_('DATOS', 'Centro no encontrado.');
  var al = alcance_(adm); if (al && !al[c.id]) throw E_('PERMISO', 'No tienes acceso a este centro.');
  var a = ahora_(), seg = Math.max(30, +cfg_().qrVentanaSeg || 60), w = Math.floor(a.ms / (seg * 1000)), cod = codigoQrCentro_(c.id, w);
  return { centroId: c.id, centro: c.nombre, qrPayload: 'CJ:' + c.id + ':' + w + ':' + cod, codigoMinuto: cod, codigoDia: codigoDiaCentro_(c.id, a.fecha), vigenciaSeg: seg, expiraEnSeg: seg - Math.floor((a.ms / 1000) % seg) };
}
function a_adminCentroGuardar(d, adm) {
  var c = d.id ? buscar('Centros', 'id', d.id) : null, nuevo = !c; if (nuevo) c = { id: id_().substr(0, 8) };
  if (!txt_(d.nombre, 80)) throw E_('DATOS', 'Escribe el nombre del centro de trabajo.');
  var hor = {}, rh = /^\d\d:\d\d$/;
  for (var w = 0; w < 7; w++) { var h = (d.horario || {})[w]; if (h && rh.test(h.e || '') && rh.test(h.s || '')) hor[w] = { e: h.e, s: h.s, ai: rh.test(h.ai || '') && rh.test(h.af || '') ? h.ai : '', af: rh.test(h.ai || '') && rh.test(h.af || '') ? h.af : '' }; }
  c.nombre = txt_(d.nombre, 80); c.cliente = txt_(d.cliente, 80); c.direccion = txt_(d.direccion, 160);
  c.lat = d.lat === '' || d.lat === null || isNaN(+d.lat) ? '' : (+d.lat).toFixed(6); c.lng = d.lng === '' || d.lng === null || isNaN(+d.lng) ? '' : (+d.lng).toFixed(6);
  c.radio = Math.max(20, Math.round(+d.radio || cfg_().radioDefecto)); c.horario = JSON.stringify(hor); c.tol = d.tol === '' || d.tol === undefined ? '' : Math.max(0, Math.round(+d.tol));
  c.festivos = d.festivos ? '1' : ''; c.activo = d.activo === false ? '0' : '1';
  var poly = Array.isArray(d.poligono) ? d.poligono.filter(function (pt) { return Array.isArray(pt) && pt.length === 2 && !isNaN(+pt[0]) && !isNaN(+pt[1]); }).map(function (pt) { return [+(+pt[0]).toFixed(6), +(+pt[1]).toFixed(6)]; }) : [];
  c.poligono = poly.length >= 3 ? JSON.stringify(poly) : '';
  c.exigirQr = d.exigirQr ? '1' : '';
  c.presupuestoHoras = +d.presupuestoHoras > 0 ? String(Math.round(+d.presupuestoHoras)) : '';
  c.presupuestoCosto = +d.presupuestoCosto > 0 ? String(Math.round(+d.presupuestoCosto)) : '';
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
function a_adminMarcaciones(d, adm) {
  var al = alcance_(adm);
  var r = rango_(d), marc = leer('Marcaciones'), L = legal_(), nombres = {}, cs = {}, out = [];
  leer('Usuarios').forEach(function (u) { if (!al || al[u.centroId]) nombres[u.cedula] = u.nombre; }); centros_().forEach(function (c) { cs[c.id] = c.nombre; });
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
    else { var centro = centroDe_(u.centroId), hor = (dia && dia.horario) || horarioDe_(centro, d.fecha, ced);
      agregar('Marcaciones', { id: id_(), cedula: ced, fecha: d.fecha, tipo: d.tipo, hora: hora, servidor: ahora_().iso, centroId: centro ? centro.id : '', manual: '1', motivo: txt_(d.motivo, 200), estado: 'ok', horario: hor ? JSON.stringify(hor) : '', origen: 'administrador', editadoPor: adm.cedula }); }
  }
  auditar_(adm.cedula, d.anular ? 'marcacion_anulada' : 'marcacion_ajustada', { cedula: ced, fecha: d.fecha, tipo: d.tipo, antes: antes, despues: d.anular ? '' : d.hora, motivo: d.motivo });
  recalcularExtras_(ced, d.fecha); return {};
}
function a_adminMarcacionRevisada(d, adm) {
  var m = buscar('Marcaciones', 'id', d.id); if (!m) throw E_('DATOS', 'No se encontró la marcación.');
  m.estado = 'ok'; m.editadoPor = adm.cedula; guardar('Marcaciones', m); auditar_(adm.cedula, 'marcacion_revisada', m.id); return {};
}
function a_adminFoto(d, adm) {
  var id = txt_(d.id, 80), ok = leer('Marcaciones').some(function (m) { return m.foto === id; }) || leer('Permisos').some(function (p) { return p.soporte === id; }) || leer('Incapacidades').some(function (i) { return i.soporte === id; });
  if (ok && alcance_(adm)) { var mf = buscar('Marcaciones', 'foto', id); ok = !!(mf && enAlcance_(adm, mf.cedula)); } // el supervisor solo ve fotos de marcaciones de su gente
  if (!id || !ok) throw E_('DATOS', 'La foto ya no está disponible.');
  try { var b = DriveApp.getFileById(id).getBlob(); return { url: 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes()) }; }
  catch (e) { throw E_('DATOS', 'La foto fue eliminada por la política de retención.'); }
}

function a_adminPermisos(d, adm) { var sup = !!alcance_(adm); return leer('Permisos').filter(function (p) { return enAlcance_(adm, p.cedula); }).reverse().slice(0, 300).map(function (p) { var o = permisoPub_(p, !sup); if (sup) o.soporte = ''; return o; }); }
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

function a_adminExtras(d, adm) {
  var al = alcance_(adm), enS = {}; if (al) leer('Usuarios').forEach(function (u) { if (al[u.centroId]) enS[u.cedula] = 1; });
  var n = {}, L = legal_(), porSem = {}; leer('Usuarios').forEach(function (u) { n[u.cedula] = u.nombre; });
  var l = leer('Extras').filter(function (x) { return x.estado !== 'sin_extra' && (!d.estado || x.estado === d.estado) && (!al || enS[x.cedula]); });
  l.forEach(function (x) { var k = x.cedula + Motor.lunesDe(x.fecha); porSem[k] = (porSem[k] || 0) + (+x.minCalc || 0); });
  return l.reverse().slice(0, 500).map(function (x) {
    return { id: x.id, cedula: x.cedula, nombre: n[x.cedula] || '', fecha: x.fecha, minCalc: +x.minCalc, minAprob: x.minAprob === '' ? null : +x.minAprob, estado: x.estado, obs: x.obs, decididoPor: x.decididoPor,
      superaDia: +x.minCalc > L.maxExtraDiaH * 60, superaSemana: porSem[x.cedula + Motor.lunesDe(x.fecha)] > L.maxExtraSemanaH * 60, cerrado: periodoCerrado_(x.fecha) };
  });
}
function a_adminExtraDecidir(d, adm) {
  var x = buscar('Extras', 'id', d.id); if (!x) throw E_('DATOS', 'No se encontró el registro.');
  if (!enAlcance_(adm, x.cedula)) throw E_('PERMISO', 'Esa persona no pertenece a tus centros de trabajo.');
  if (periodoCerrado_(x.fecha)) throw E_('CERRADO', 'Ese día pertenece a una nómina cerrada.');
  var L = legal_(), min = d.decision === 'aprobar' ? Math.round(+d.min) : 0;
  if (d.decision === 'aprobar') {
    if (!(min > 0) || min > +x.minCalc) throw E_('DATOS', 'Los minutos aprobados deben estar entre 1 y ' + x.minCalc + '.');
    if (min > L.maxExtraDiaH * 60 && !d.confirmaTope) throw E_('TOPE', 'Vas a aprobar más de ' + L.maxExtraDiaH + ' horas extra en un día, por encima del máximo legal. Confirma si cuentas con autorización del Ministerio del Trabajo.');
  }
  var aComp = d.decision === 'aprobar' && !!d.aCompensatorio;
  x.estado = d.decision === 'aprobar' ? 'aprobada' : 'rechazada'; x.minAprob = aComp ? 0 : min; x.decididoPor = adm.cedula; x.decididoEl = ahora_().iso; x.obs = txt_(d.obs, 200) + (d.confirmaTope ? ' [Aprobado por encima del tope legal]' : '') + (aComp ? ' [Abonado a banco de compensatorios: ' + min + ' min]' : '');
  guardar('Extras', x);
  if (aComp && min > 0) agregar('Compensatorios', { id: id_(), cedula: x.cedula, fecha: x.fecha, minutos: String(min), tipo: 'abono', motivo: 'Horas extra del ' + x.fecha, creadoPor: adm.cedula, creado: ahora_().iso });
  auditar_(adm.cedula, 'extra_' + x.estado, { cedula: x.cedula, fecha: x.fecha, min: min, tope: !!d.confirmaTope, aCompensatorio: aComp }); return {};
}

/* ---------- Horas extra en lote y novedades de pago (bonos, auxilios, descuentos) ---------- */
function a_adminExtrasLote(d, adm) {
  var L = legal_(), n = 0, a = ahora_(), ids = {}; (d.ids || []).forEach(function (x) { ids[x] = 1; });
  leer('Extras').forEach(function (x) {
    if (!ids[x.id] || x.estado !== 'pendiente' || +x.minCalc > L.maxExtraDiaH * 60 || periodoCerrado_(x.fecha) || !enAlcance_(adm, x.cedula)) return;
    x.estado = 'aprobada'; x.minAprob = x.minCalc; x.decididoPor = adm.cedula; x.decididoEl = a.iso; x.obs = 'Aprobada en lote'; guardar('Extras', x); n++;
  });
  auditar_(adm.cedula, 'extras_lote', { aprobadas: n }); return { aprobadas: n };
}
function a_adminNovedades(d) {
  var r = rango_(d, 62), n = {}; leer('Usuarios').forEach(function (u) { n[u.cedula] = u.nombre; });
  return leer('Novedades').filter(function (x) { return x.fecha >= r.desde && x.fecha <= r.hasta; }).reverse().map(function (x) {
    return { id: x.id, cedula: x.cedula, nombre: n[x.cedula] || x.cedula, fecha: x.fecha, concepto: x.concepto, valor: +x.valor, salarial: x.salarial === '1', nota: x.nota, cerrado: periodoCerrado_(x.fecha) }; });
}
function a_adminNovedadGuardar(d, adm) {
  if (d.borrar) { var x = buscar('Novedades', 'id', d.id); if (!x) return {}; if (periodoCerrado_(x.fecha)) throw E_('CERRADO', 'Pertenece a una nómina cerrada.'); borrar('Novedades', x); auditar_(adm.cedula, 'novedad_borrada', { cedula: x.cedula, concepto: x.concepto, valor: x.valor }); return {}; }
  var ceds = (d.cedulas || []).map(soloDigitos_).filter(function (c) { return buscar('Usuarios', 'cedula', c); }), valor = Math.round(+d.valor || 0);
  if (!ceds.length) throw E_('DATOS', 'Elige al menos una persona.');
  if (!/^\d{4}-\d\d-\d\d$/.test(d.fecha || '')) throw E_('DATOS', 'Indica la fecha: define en qué periodo se paga o descuenta.');
  if (periodoCerrado_(d.fecha)) throw E_('CERRADO', 'Esa fecha pertenece a una nómina cerrada. Usa una fecha del periodo abierto para hacer el ajuste.');
  if (!valor) throw E_('DATOS', 'Escribe el valor.'); if (txt_(d.concepto, 60).length < 3) throw E_('DATOS', 'Escribe el concepto (por ejemplo: Bono de alturas).');
  if (d.tipo === 'descuento') valor = -Math.abs(valor); else valor = Math.abs(valor);
  ceds.forEach(function (c) { agregar('Novedades', { id: id_(), cedula: c, fecha: d.fecha, concepto: txt_(d.concepto, 60), valor: valor, salarial: d.tipo === 'salarial' ? '1' : '', nota: txt_(d.nota, 200), creadoPor: adm.cedula, creado: ahora_().iso }); });
  auditar_(adm.cedula, 'novedad_creada', { personas: ceds.length, concepto: d.concepto, valor: valor, tipo: d.tipo }); return {};
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
    porRevisar: leer('Marcaciones').filter(function (m) { return m.estado === 'revisar' && m.fecha >= r.desde && m.fecha <= r.hasta; }).length,
    extrasPendientes: leer('Extras').filter(function (x) { return x.estado === 'pendiente' && x.fecha >= r.desde && x.fecha <= r.hasta; }).length,
    permisosPendientes: leer('Permisos').filter(function (p) { return ['en_firmas', 'firmado', 'vencido'].indexOf(p.estado) >= 0 && p.fechaSalida <= r.hasta && p.fechaRegreso >= r.desde; }).length,
    filas: liquidarTodos_(r.desde, r.hasta, corte).map(function (x) { x.liq = sinDetalle_(x.liq); return x; }) };
}
function a_adminNominaCerrar(d, adm) {
  var r = rango_(d, 31), a = ahora_(), c = cfg_();
  if (r.hasta > r.hoy) throw E_('DATOS', 'El periodo aún no termina. Podrás cerrarlo desde el ' + Motor.sumar(r.hasta, 1) + '.');
  if (leer('Periodos').some(function (p) { return p.desde <= r.hasta && r.desde <= p.hasta; })) throw E_('CERRADO', 'Ya existe una nómina cerrada que cubre esas fechas.');
  var rev = leer('Marcaciones').filter(function (m) { return m.estado === 'revisar' && m.fecha >= r.desde && m.fecha <= r.hasta; }).length;
  if (rev) throw E_('REVISAR', 'Hay ' + rev + ' marcación(es) digitadas o tardías sin revisar en este periodo. Revísalas en Marcaciones antes de cerrar: con ellas se va a pagar.');
  // Descuento automático de cuotas de préstamos activos en el cierre de nómina
  if (d.descontarPrestamos !== false) {
    leer('Prestamos').filter(function (p) { return p.estado === 'activo' && +p.saldo > 0; }).forEach(function (p) {
      var ya = leer('Novedades').some(function (n) { return n.cedula === p.cedula && n.fecha >= r.desde && n.fecha <= r.hasta && n.concepto === 'Cuota: ' + p.concepto; });
      if (!ya) a_adminPrestamoAplicarCuota({ id: p.id, fecha: r.hasta }, adm);
    });
  }
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
  return leer('Nomina').filter(function (n) { return n.desde === d.desde && n.hasta === d.hasta; }).map(function (n) { return { id: n.id, desde: n.desde, hasta: n.hasta, cedula: n.cedula, nombre: n.nombre, neto: +n.neto, generado: n.generado, acuse: n.acuse || '', detalle: json_(n.detalle, {}) }; });
}

function a_confirmarDesprendible(d, u) {
  var n = buscar('Nomina', 'id', txt_(d.id, 40));
  if (!n || n.cedula !== u.cedula) throw E_('DATOS', 'No se encontró ese desprendible.');
  if (n.acuse) return { acuse: n.acuse };
  n.acuse = ahora_().iso; guardar('Nomina', n);
  auditar_(u.cedula, 'desprendible_recibido', { id: n.id, desde: n.desde, hasta: n.hasta });
  return { acuse: n.acuse };
}

function a_adminLiberarDispositivo(d, adm) {
  var u = buscar('Usuarios', 'cedula', soloDigitos_(d.cedula));
  if (!u) throw E_('DATOS', 'No se encontró la persona.');
  u.dispositivoId = ''; guardar('Usuarios', u); cerrarSesiones_(u.cedula);
  auditar_(adm.cedula, 'liberar_dispositivo', u.cedula);
  return { ok: true };
}

function a_adminAnonimizarUsuario(d, adm) {
  var u = buscar('Usuarios', 'cedula', soloDigitos_(d.cedula));
  if (!u) throw E_('DATOS', 'No se encontró la persona.');
  if (u.estado !== 'inactivo') throw E_('DATOS', 'Primero desactiva a la persona antes de suprimir sus datos personales.');
  u.nombre = 'Exempleado ' + sha_(u.cedula + '|' + prop_('SECRETO')).substr(0, 8).toUpperCase();
  u.email = ''; u.telefono = ''; u.eps = ''; u.arl = ''; u.banco = ''; u.tipoCuenta = ''; u.cuenta = '';
  u.dispositivoId = ''; u.hash = ''; u.salt = ''; u.codigo = '';
  if (u.fotoRef) { try { DriveApp.getFileById(u.fotoRef).setTrashed(true); } catch (e) { } u.fotoRef = ''; }
  guardar('Usuarios', u); cerrarSesiones_(u.cedula);
  auditar_(adm.cedula, 'anonimizar_usuario', u.cedula);
  return { ok: true };
}

function a_adminIncapacidadEditar(d, adm) {
  var inc = buscar('Incapacidades', 'id', txt_(d.id, 40));
  if (!inc) throw E_('DATOS', 'No se encontró la incapacidad.');
  var re = /^\d{4}-\d\d-\d\d$/, desde = re.test(d.desde || '') ? d.desde : inc.desde, hasta = re.test(d.hasta || '') ? d.hasta : inc.hasta;
  if (hasta < desde) throw E_('DATOS', 'El rango de fechas no es válido.');
  if (periodoCerrado_(inc.desde) || periodoCerrado_(desde)) throw E_('CERRADO', 'La incapacidad toca un periodo de nómina cerrado.');
  inc.tipo = ['general', 'laboral', 'maternidad', 'paternidad'].indexOf(d.tipo) >= 0 ? d.tipo : inc.tipo;
  inc.desde = desde; inc.hasta = hasta;
  if (d.entidad !== undefined) inc.entidad = txt_(d.entidad, 60);
  if (d.nota !== undefined) inc.nota = txt_(d.nota, 200);
  guardar('Incapacidades', inc);
  auditar_(adm.cedula, 'incapacidad_editada', { id: inc.id, cedula: inc.cedula, desde: inc.desde, hasta: inc.hasta });
  return { ok: true };
}

function a_adminTrasladoMasivo(d, adm) {
  var centroId = txt_(d.centroId, 20), ceds = Array.isArray(d.cedulas) ? d.cedulas : [];
  if (!centroId || !centroDe_(centroId)) throw E_('DATOS', 'Selecciona un centro de trabajo válido.');
  if (!ceds.length || ceds.length > 200) throw E_('DATOS', 'Selecciona entre 1 y 200 personas para trasladar.');
  var movidos = 0;
  ceds.forEach(function (c) {
    var u = buscar('Usuarios', 'cedula', soloDigitos_(c));
    if (!u || u.estado === 'inactivo') return;
    u.centroId = centroId; guardar('Usuarios', u); movidos++;
  });
  auditar_(adm.cedula, 'traslado_masivo', { centroId: centroId, cantidad: movidos, nota: txt_(d.nota, 120) });
  return { movidos: movidos };
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
  o.telegramToken = ''; o.tieneTelegram = !!(prop_('TELEGRAM_TOKEN') || c.telegramToken);
  o.jefes = leer('Jefes').map(function (j) { return { id: j.id, nombre: j.nombre, cargo: j.cargo, email: j.email, whatsapp: j.whatsapp, centros: json_(j.centros, []), activo: j.activo !== '0', tienePin: !!j.pin }; });
  o.codigoAdminPendiente = !!prop_('CODIGO_ADMIN'); return o;
}
function a_adminConfigGuardar(d, adm) {
  var cambios = [];
  Object.keys(d).forEach(function (k) {
    if (k === 'telegramToken') { if (d[k]) { prop_('TELEGRAM_TOKEN', txt_(d[k], 120)); cambios.push('telegramToken'); } return; }
    if (!(k in CFG_DEF) || k === 'zona') return; var v = d[k], def = CFG_DEF[k];
    if (typeof def === 'number') { v = +v; if (isNaN(v) || v < 0) throw E_('DATOS', 'Valor no válido en "' + k + '".'); }
    else if (typeof def === 'boolean') v = !!v;
    else if (typeof def === 'string') v = txt_(v, 300);
    else if (k === 'legal') { var L = {}; Object.keys(v || {}).forEach(function (q) { if (!(q in Motor.DEF)) return; if (q === 'festivosExtra') L[q] = (v[q] || []).filter(function (f) { return /^\d{4}-\d\d-\d\d$/.test(f); }); else if (typeof Motor.DEF[q] === 'string') L[q] = /^\d\d:\d\d$/.test(v[q]) ? v[q] : Motor.DEF[q]; else if (typeof Motor.DEF[q] === 'boolean') L[q] = !!v[q]; else if (v[q] !== '' && v[q] !== null && !isNaN(+v[q])) L[q] = +v[q]; }); v = L; }
    else if (k === 'empresa') { var e = {}; Object.keys(CFG_DEF.empresa).forEach(function (q) { e[q] = txt_((v || {})[q], q === 'logo' ? 40000 : 200); }); if (e.logo && !/^data:image\/(png|jpeg|webp);base64,/.test(e.logo) && !/^https:\/\//.test(e.logo)) e.logo = ''; if (e.color && !/^#[0-9a-fA-F]{6}$/.test(e.color)) e.color = ''; v = e; }
    else if (k === 'codigosConcepto') { var cc = {}; Object.keys(v || {}).forEach(function (q) { if (/^[A-Z]{2,5}$/.test(q) && txt_(v[q], 20)) cc[q] = txt_(v[q], 20); }); v = cc; }
    else if (k === 'alertas') { var al = {}; Object.keys(TIPOS_ALERTA).forEach(function (q) { var x = (v || {})[q] || {}; al[q] = { activo: x.activo !== false, correos: txt_(x.correos, 300) }; }); v = al; }
    cfgSet_(k, v); cambios.push(k);
  });
  auditar_(adm.cedula, 'configuracion', cambios.join(', ')); return a_adminConfig();
}
function a_adminJefeGuardar(d, adm) {
  var j = d.id ? buscar('Jefes', 'id', d.id) : null, nuevo = !j; if (nuevo) j = { id: id_().substr(0, 8), pin: '' };
  if (!txt_(d.nombre, 80)) throw E_('DATOS', 'Escribe el nombre del jefe.');
  j.nombre = txt_(d.nombre, 80); j.cargo = txt_(d.cargo, 60); j.email = txt_(d.email, 120); j.whatsapp = soloDigitos_(d.whatsapp).substr(0, 15); j.centros = JSON.stringify((d.centros || []).map(function (x) { return txt_(x, 20); })); j.activo = d.activo === false ? '0' : '1';
  if (d.pin) { if (!/^\d{6,8}$/.test(String(d.pin))) throw E_('DATOS', 'La clave de firma debe tener entre 6 y 8 números.'); j.pin = hmac_('pin|' + j.id + '|' + d.pin); }
  if (!j.pin) throw E_('DATOS', 'Asigna una clave de firma. Sin ella el jefe no puede firmar.');
  if (nuevo) agregar('Jefes', j); else guardar('Jefes', j);
  auditar_(adm.cedula, nuevo ? 'jefe_creado' : 'jefe_editado', { id: j.id, nombre: j.nombre, cambioClave: !!d.pin }); return {};
}
function a_adminBitacoras(d) {
  var n = { alertas: 'Alertas', auditoria: 'Auditoria', errores: 'Errores' }[d.cual]; if (!n) throw E_('DATOS', 'Bitácora desconocida.');
  return leer(n, 400).reverse().map(function (r) { var o = {}; HOJAS[n].forEach(function (k) { o[k] = r[k]; }); return o; });
}
function a_adminVerificarAuditoria() {
  var filas = leer('Auditoria'), ant = 'GENESIS', alteradas = [];
  filas.forEach(function (r) {
    if (!r.hash) { ant = ''; return; } // filas anteriores a v1.4.1
    var esp = hmac_(ant + '|' + r.fecha + '|' + r.actor + '|' + r.accion + '|' + r.detalle).substr(0, 32);
    if (!igualSeguro_(r.hash, esp)) alteradas.push({ fila: r._f, fecha: r.fecha, accion: r.accion });
    ant = r.hash;
  });
  return { total: filas.length, integra: alteradas.length === 0, alteradas: alteradas.slice(0, 50) };
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
    Personal: leer('Usuarios').map(function (u) { return { 'Cédula': u.cedula, Nombre: u.nombre, Cargo: u.cargo, 'Centro de trabajo': cs[u.centroId] || '', Rol: u.rol, Estado: u.estado, Salario: +u.salario || 0, 'Salario validado': u.salarioOk === '1' ? 'Sí' : 'No', 'Tipo de pago': u.tipoPago, Ingreso: u.ingreso, EPS: u.eps, ARL: u.arl, Correo: u.email, 'Teléfono': u.telefono, Banco: u.banco, 'Tipo de cuenta': u.tipoCuenta, 'Número de cuenta': u.cuenta }; }),
    Jornadas: a_adminMarcaciones(r).reverse().map(function (x) { return { Fecha: x.fecha, 'Cédula': x.cedula, Nombre: x.nombre, 'Centro de trabajo': x.centro, Entrada: x.entrada, 'Salida almuerzo': x.salAlm, 'Regreso almuerzo': x.entAlm, Salida: x.salida, 'Horas trabajadas': h(x.min), 'Horas extra': h(x.extra), 'Minutos tarde': x.tarde, 'Marcación digitada': x.marcas.some(function (m) { return m.manual; }) ? 'Sí' : '', 'Fuera de zona': x.marcas.some(function (m) { return m.enZona === '0'; }) ? 'Sí' : '', Incompleta: x.incompleto ? 'Sí' : '' }; }),
    'Horas extra': a_adminExtras({}).filter(function (x) { return x.fecha >= r.desde && x.fecha <= r.hasta; }).map(function (x) { return { Fecha: x.fecha, 'Cédula': x.cedula, Nombre: x.nombre, 'Horas calculadas': h(x.minCalc), 'Horas aprobadas': x.minAprob === null ? '' : h(x.minAprob), Estado: x.estado, 'Supera tope diario': x.superaDia ? 'Sí' : '', 'Observación': x.obs }; }),
    Permisos: leer('Permisos').filter(function (p) { return dentro(p.fechaSalida, p.fechaRegreso); }).map(function (p) { var q = permisoPub_(p); return { 'Cédula': p.cedula, Nombre: q.nombre, Tipo: q.tipoNombre, Norma: q.norma, Remunerado: q.remunerado ? 'Sí' : 'No', 'Fecha salida': p.fechaSalida, 'Hora salida': p.horaSalida, 'Fecha regreso': p.fechaRegreso, 'Hora regreso': p.horaRegreso, Motivo: p.motivo, Estado: p.estado, Firmas: q.firmas.map(function (f) { return f.nombre + ': ' + f.estado; }).join(' | '), 'Decidido por': p.decididoPor, 'Observación': p.obs }; }),
    Incapacidades: leer('Incapacidades').filter(function (i) { return dentro(i.desde, i.hasta); }).map(function (i) { return { 'Cédula': i.cedula, Nombre: n[i.cedula] || '', Tipo: i.tipo, Desde: i.desde, Hasta: i.hasta, 'Días': Motor.diasEntre(i.desde, i.hasta) + 1, Entidad: i.entidad, Nota: i.nota }; }),
    'Nómina estimada': previa.filas.map(function (x) { var q = x.liq, v = function (c) { var t = q.conceptos.filter(function (k) { return k.cod === c; })[0]; return t ? t.valor : 0; };
      return { 'Cédula': x.cedula, Nombre: x.nombre, 'Centro de trabajo': x.centro, Salario: x.salario, 'Días liquidados': q.diasNomina, 'Horas trabajadas': q.horas.trabajadas, 'Horas extra pagadas': q.horas.extras, 'Horas extra sin aprobar': q.horas.extrasSinAprobar, Ausencias: q.ausencias, Tardanzas: q.tardanzas,
        'Salario básico': v('SAL'), 'Recargos y dominicales': v('RN') + v('DF') + v('DFN'), 'Horas extra $': v('HED') + v('HEN') + v('HEDF') + v('HENF'), 'Auxilio transporte': v('AUX'), Devengado: q.devengado, Deducciones: q.deducciones, 'Neto a pagar': q.neto }; }),
    'Vacaciones y ausentismo': (function () { var hoy = ahora_().fecha, tom = {}, ex = {};
      leer('Permisos').forEach(function (p) { if (p.tipo === 'vacaciones' && p.estado === 'aprobado') tom[p.cedula] = (tom[p.cedula] || 0) + Motor.diasHabiles(p.fechaSalida, Motor.sumar(p.fechaRegreso, -1), legal_(), false); });
      previa.filas.forEach(function (x) { ex[x.cedula] = x.liq; });
      return leer('Usuarios').filter(function (u) { return u.estado === 'activo'; }).map(function (u) { var c = Motor.vacacionesCausadas(u.ingreso, hoy), q = ex[u.cedula];
        return { 'Cédula': u.cedula, Nombre: u.nombre, Ingreso: String(u.ingreso).substr(0, 10), 'Vacaciones causadas (días hábiles)': c, 'Vacaciones disfrutadas': tom[u.cedula] || 0, 'Saldo de vacaciones': Math.round((c - (tom[u.cedula] || 0)) * 10) / 10,
          'Ausencias en el rango': q ? q.ausencias : '', 'Tardanzas en el rango': q ? q.tardanzas : '', 'Minutos tarde': q ? q.tardanzaMin : '' }; }); })(),
    'Resumen por obra': a_adminResumenObra(r).obras.map(function (o) { return { 'Centro de trabajo': o.centro, 'Personas asignadas': o.personas, 'Días-persona trabajados': o.dias, 'Horas trabajadas': o.horas, 'Horas extra': o.extras, Tardanzas: o.tardanzas, Ausencias: o.ausencias, 'Costo devengado del personal asignado': o.costo }; }) };
}

/* ---------- Registro de acciones ---------- */
function registrarAcciones_() {
  var P = 'publico', U = 'usuario', A = 'admin', V = 'supervisor';
  [['publico', P, 0, a_publico], ['consultarCedula', P, 0, a_consultarCedula], ['registro', P, 1, a_registro], ['login', P, 1, a_login], ['firmaVer', P, 0, a_firmaVer], ['firmaResponder', P, 1, a_firmaResponder], ['error', P, 1, a_error], ['recuperarPedir', P, 1, a_recuperarPedir], ['recuperarCambiar', P, 1, a_recuperarCambiar],
   ['salir', U, 1, a_salir], ['cambiarClave', U, 1, a_cambiarClave], ['consentir', U, 1, a_consentir], ['misDatos', U, 1, a_misDatos], ['yo', U, 0, a_yo], ['marcar', U, 1, a_marcar], ['bloqueo', U, 1, a_bloqueo], ['historial', U, 0, a_historial],
   ['permisoCrear', U, 1, a_permisoCrear], ['permisosMios', U, 0, a_permisosMios], ['permisoCancelar', U, 1, a_permisoCancelar], ['desprendibles', U, 0, a_desprendibles],
   ['adminTablero', V, 0, a_adminTablero], ['adminPersonal', A, 0, a_adminPersonal], ['adminPersonaGuardar', A, 1, a_adminPersonaGuardar], ['adminPersonaCodigo', A, 1, a_adminPersonaCodigo], ['adminPersonaImportar', A, 1, a_adminPersonaImportar],
   ['adminCentros', V, 0, a_adminCentros], ['adminCentroGuardar', A, 1, a_adminCentroGuardar], ['adminMarcaciones', V, 0, a_adminMarcaciones], ['adminMarcacionGuardar', A, 1, a_adminMarcacionGuardar], ['adminMarcacionRevisada', A, 1, a_adminMarcacionRevisada], ['adminFoto', V, 0, a_adminFoto],
   ['adminPermisos', V, 0, a_adminPermisos], ['adminPermisoDecidir', A, 1, a_adminPermisoDecidir], ['adminPermisoRegistrar', A, 1, a_adminPermisoRegistrar], ['adminIncapacidades', A, 0, a_adminIncapacidades], ['adminIncapacidadGuardar', A, 1, a_adminIncapacidadGuardar],
   ['adminExtras', V, 0, a_adminExtras], ['adminExtraDecidir', V, 1, a_adminExtraDecidir], ['adminNominaPrevia', A, 0, a_adminNominaPrevia], ['adminNominaCerrar', A, 1, a_adminNominaCerrar], ['adminNominas', A, 0, a_adminNominas], ['adminNominaDetalle', A, 0, a_adminNominaDetalle],
   ['adminResumenObra', A, 0, a_adminResumenObra], ['adminConfig', A, 0, a_adminConfig], ['adminConfigGuardar', A, 1, a_adminConfigGuardar], ['adminJefeGuardar', A, 1, a_adminJefeGuardar], ['adminBitacoras', A, 0, a_adminBitacoras], ['adminSalud', A, 0, a_adminSalud],
   ['adminRespaldar', A, 1, a_adminRespaldar], ['adminExportar', A, 0, a_adminExportar],
   ['adminExtrasLote', V, 1, a_adminExtrasLote], ['adminNovedades', A, 0, a_adminNovedades], ['adminNovedadGuardar', A, 1, a_adminNovedadGuardar],
   ['adminInforme', V, 0, a_adminInforme], ['miResumen', U, 0, a_miResumen],
   ['adminTurnos', A, 0, a_adminTurnos], ['adminTurnoGuardar', A, 1, a_adminTurnoGuardar], ['adminProgramar', A, 1, a_adminProgramar], ['adminProgramacionBorrar', A, 1, a_adminProgramacionBorrar],
   ['confirmarDesprendible', U, 1, a_confirmarDesprendible, 'nomina'], ['adminLiberarDispositivo', A, 1, a_adminLiberarDispositivo, 'seguridadPro'], ['adminAnonimizarUsuario', A, 1, a_adminAnonimizarUsuario], ['adminIncapacidadEditar', A, 1, a_adminIncapacidadEditar, 'permisos'], ['adminTrasladoMasivo', A, 1, a_adminTrasladoMasivo], ['adminQrCentro', V, 0, a_adminQrCentro, 'qr'],
   ['kioscoMarcar', V, 1, a_kioscoMarcar, 'kiosco'],
   ['adminProvisiones', A, 0, a_adminProvisiones, 'nomina'], ['adminLiquidacionContrato', A, 0, a_adminLiquidacionContrato, 'nomina'], ['adminPrestamos', A, 0, a_adminPrestamos, 'prestamos'], ['adminPrestamoGuardar', A, 1, a_adminPrestamoGuardar, 'prestamos'], ['adminPrestamoAplicarCuota', A, 1, a_adminPrestamoAplicarCuota, 'prestamos'],
   ['misCompensatorios', U, 0, a_misCompensatorios, 'nomina'], ['adminCompensatorioGuardar', A, 1, a_adminCompensatorioGuardar, 'nomina'], ['certificadoLaboral', U, 0, a_certificadoLaboral, 'autoservicio'],
   ['adminComunicadoCrear', A, 1, a_adminComunicadoCrear, 'autoservicio'], ['adminComunicados', A, 0, a_adminComunicados, 'autoservicio'], ['comunicadosMios', U, 0, a_comunicadosMios, 'autoservicio'], ['comunicadoLeer', U, 1, a_comunicadoLeer, 'autoservicio'],
   ['adminPresupuestoObras', A, 0, a_adminPresupuestoObras, 'presupuesto'], ['adminEnVivo', V, 0, a_adminEnVivo, 'tablero360'],
   ['salirTodas', U, 1, a_salirTodas], ['adminVerificarAuditoria', A, 0, a_adminVerificarAuditoria, 'seguridadPro'],
   ['miProgramacion', U, 0, a_miProgramacion, 'turnos'], ['misPrestamos', U, 0, a_misPrestamos, 'prestamos'], ['misExtras', U, 0, a_misExtras, 'nomina'], ['incapacidadReportar', U, 1, a_incapacidadReportar, 'permisos'], ['contactosEmergencia', U, 0, a_contactosEmergencia],
   ['adminExpediente360', V, 0, a_adminExpediente360, 'tablero360'], ['adminTablero360', V, 0, a_adminTablero360, 'tablero360'], ['adminLicenciaActivar', A, 1, a_adminLicenciaActivar]
  ].forEach(function (x) { accion_(x[0], x[1], !!x[2], x[3], x[4]); });
}


// ===================== Turnos.gs =====================
/**
 * CONTROL DE JORNADA — Turnos rotativos y recuperación de contraseña.
 */

/* ---------- Recuperar contraseña con código enviado al correo registrado ---------- */
function a_recuperarPedir(d) {
  var ced = soloDigitos_(d.cedula); limite_('recp:' + ced, 3, 3600);
  var u = buscar('Usuarios', 'cedula', ced);
  if (!u || !u.hash || u.estado === 'inactivo') return { enviado: false };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u.email)) return { enviado: false, sinCorreo: true };
  var cod = codigo6_(); CacheService.getScriptCache().put('rec:' + ced, hmac_('rec|' + ced + '|' + cod), 900);
  var r = correo_(u.email, 'Código para cambiar tu contraseña', 'Tu código es: ' + cod + '\n\nVence en 15 minutos. Si no lo pediste, ignora este mensaje: tu contraseña sigue igual.');
  auditar_(ced, 'recuperar_pedido', '');
  var p = u.email.split('@');
  return { enviado: r.indexOf('@') > 0, pista: p[0].substr(0, 2) + '***@' + p[1] };
}
function a_recuperarCambiar(d) {
  var ced = soloDigitos_(d.cedula); limite_('recc:' + ced, 5, 900); // 5 intentos sobre un millón de códigos
  var c = CacheService.getScriptCache(), h = c.get('rec:' + ced);
  if (!h || h !== hmac_('rec|' + ced + '|' + soloDigitos_(d.codigo))) throw E_('CODIGO', 'El código no coincide o ya venció. Pide uno nuevo.');
  if (claveDebil_(d.clave, ced)) throw E_('DATOS', 'Elige una contraseña de al menos 6 caracteres que no sea tu cédula ni una secuencia fácil.');
  var u = buscar('Usuarios', 'cedula', ced); if (!u || u.estado === 'inactivo') throw E_('PERMISO', 'Tu usuario no está activo.');
  u.salt = azar_().substr(0, 16); u.hash = hashClave_(String(d.clave), u.salt); guardar('Usuarios', u);
  c.remove('rec:' + ced); cerrarSesiones_(ced); auditar_(ced, 'clave_recuperada', '');
  return { token: crearSesion_(ced, d.equipo), usuario: usuarioPublico_(u) };
}

/* ---------- Turnos y programación por fechas ---------- */
function turnoPub_(t) { return { id: t.id, nombre: t.nombre, e: t.e, s: t.s, ai: t.ai, af: t.af, dias: json_(t.dias, []), activo: t.activo !== '0', min: Motor.jornadaMin({ e: t.e, s: t.s, ai: t.ai, af: t.af }) }; }
function a_adminTurnos() {
  var a = ahora_(), n = {}, tn = { descanso: 'Descanso' }, desde = Motor.sumar(a.fecha, -31);
  leer('Usuarios').forEach(function (u) { n[u.cedula] = u.nombre; });
  var turnos = leer('Turnos').map(turnoPub_); turnos.forEach(function (t) { tn[t.id] = t.nombre; });
  return { turnos: turnos, programacion: leer('Programacion').filter(function (p) { return p.hasta >= desde; }).reverse().map(function (p) {
    return { id: p.id, cedula: p.cedula, nombre: n[p.cedula] || p.cedula, desde: p.desde, hasta: p.hasta, turnoId: p.turnoId, turno: tn[p.turnoId] || '(turno eliminado)', cerrado: periodoCerrado_(p.desde) }; }) };
}
function a_adminTurnoGuardar(d, adm) {
  var rh = /^\d\d:\d\d$/, t = d.id ? buscar('Turnos', 'id', d.id) : null, nuevo = !t; if (nuevo) t = { id: id_().substr(0, 8) };
  if (!txt_(d.nombre, 40)) throw E_('DATOS', 'Ponle un nombre al turno (por ejemplo: Noche 22-06).');
  if (!rh.test(d.e || '') || !rh.test(d.s || '')) throw E_('DATOS', 'Indica la hora de entrada y la de salida.');
  var alm = rh.test(d.ai || '') && rh.test(d.af || '');
  t.nombre = txt_(d.nombre, 40); t.e = d.e; t.s = d.s; t.ai = alm ? d.ai : ''; t.af = alm ? d.af : '';
  t.dias = JSON.stringify((d.dias || []).map(Number).filter(function (x) { return x >= 0 && x <= 6; })); t.activo = d.activo === false ? '0' : '1';
  if (nuevo) agregar('Turnos', t); else guardar('Turnos', t);
  auditar_(adm.cedula, nuevo ? 'turno_creado' : 'turno_editado', { id: t.id, nombre: t.nombre, e: t.e, s: t.s }); return turnoPub_(t);
}
function a_adminProgramar(d, adm) {
  var re = /^\d{4}-\d\d-\d\d$/, ceds = (d.cedulas || []).map(soloDigitos_).filter(Boolean), a = ahora_();
  if (!ceds.length) throw E_('DATOS', 'Elige al menos una persona.');
  if (!re.test(d.desde || '') || !re.test(d.hasta || '') || d.hasta < d.desde) throw E_('DATOS', 'Revisa las fechas.');
  if (Motor.diasEntre(d.desde, d.hasta) > 92) throw E_('DATOS', 'Programa máximo tres meses a la vez.');
  if (periodoCerrado_(d.desde)) throw E_('CERRADO', 'La fecha inicial pertenece a una nómina cerrada.');
  if (d.turnoId !== 'descanso' && !buscar('Turnos', 'id', d.turnoId)) throw E_('DATOS', 'Elige el turno.');
  ceds.forEach(function (c) { if (buscar('Usuarios', 'cedula', c)) agregar('Programacion', { id: id_(), cedula: c, desde: d.desde, hasta: d.hasta, turnoId: d.turnoId, creadoPor: adm.cedula, creado: a.iso }); });
  auditar_(adm.cedula, 'turno_programado', { personas: ceds.length, desde: d.desde, hasta: d.hasta, turno: d.turnoId }); return {};
}
function a_adminProgramacionBorrar(d, adm) {
  var p = buscar('Programacion', 'id', d.id); if (!p) throw E_('DATOS', 'No se encontró la programación.');
  if (periodoCerrado_(p.desde)) throw E_('CERRADO', 'Pertenece a una nómina cerrada y ya no se puede quitar.');
  borrar('Programacion', p); auditar_(adm.cedula, 'turno_desprogramado', { cedula: p.cedula, desde: p.desde, hasta: p.hasta }); return {};
}


// ===================== Informes.gs =====================
/**
 * CONTROL DE JORNADA — Informes versátiles: cualquier rango, filtros y agrupación, con las mismas reglas de la nómina.
 */
var AGRUPACIONES = { persona: 1, centro: 1, cargo: 1, dia: 1, semana: 1, mes: 1, diaSemana: 1, total: 1 };
var NOMBRE_DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function a_adminInforme(d, adm) {
  var r = rango_(d, 93), corte = r.hasta < r.hoy ? r.hasta : r.hoy, L = legal_(), al = alcance_(adm), verCosto = !al, c = cfg_();
  var por = AGRUPACIONES[d.agrupar] ? d.agrupar : 'persona', f = d.filtros || {}, marc = leer('Marcaciones');
  var setDe = function (l) { var m = null; (l || []).forEach(function (x) { (m = m || {})[String(x)] = 1; }); return m; };
  var fCentro = setDe(f.centros), fPersona = setDe(f.cedulas), fCargo = setDe(f.cargos), cs = {};
  centros_().forEach(function (x) { cs[x.id] = x.nombre; });
  var factor = 1 + (+c.factorPrestacional || 0) / 100, g = {}, totalPersonas = {};
  function clave(fecha, u, cid) {
    switch (por) {
      case 'persona': return [u.cedula, u.nombre];
      case 'centro': return [cid || '-', cs[cid] || 'Sin centro'];
      case 'cargo': return [u.cargo || '-', u.cargo || 'Sin cargo'];
      case 'dia': return [fecha, fecha];
      case 'semana': var l = Motor.lunesDe(fecha); return [l, 'Semana del ' + l];
      case 'mes': return [fecha.substr(0, 7), fecha.substr(0, 7)];
      case 'diaSemana': var w = Motor.dow(fecha); return [String((w + 6) % 7), NOMBRE_DIA[w]];
      default: return ['total', 'Total'];
    }
  }
  function grupo(k) { return g[k[0]] || (g[k[0]] = { clave: k[0], nombre: k[1], personas: {}, dias: 0, horas: 0, ordinarias: 0, nocturnas: 0, dominicales: 0, extras: 0, extrasAprob: 0, extrasPend: 0, tardanzas: 0, minTarde: 0, ausencias: 0, incompletas: 0, digitadas: 0, fueraZona: 0, diasPermiso: 0, diasIncapacidad: 0, costo: 0 }); }
  leer('Usuarios').forEach(function (u) {
    if (u.estado === 'preregistrado' || (al && !al[u.centroId]) || (fPersona && !fPersona[u.cedula]) || (fCargo && !fCargo[u.cargo || '-'])) return;
    if (u.estado !== 'activo' && !(u.retiro && u.retiro >= r.desde)) return;
    var ins = insumos_(u, r.desde, r.hasta, corte, marc), liq = Motor.liquidarPeriodo(ins, L), diaCentro = {}, marcasDia = {};
    ins.dias.forEach(function (x) { diaCentro[x.fecha] = x.centroId; marcasDia[x.fecha] = x.marcas; });
    var minTot = 0; Object.keys(liq.porFecha).forEach(function (k) { minTot += liq.porFecha[k].trabajadoMin || 0; });
    var ausentes = setDe(liq.ausentes) || {}, dDesde = ins.ingreso && ins.ingreso > r.desde ? ins.ingreso : r.desde, dHasta = liq.corte, nDias = Math.max(1, Motor.diasEntre(dDesde, dHasta) + 1);
    var cubre = function (l, x) { return l.some(function (p) { return p.desde <= x && x <= p.hasta && !p.horas; }); };
    for (var fe = dDesde; fe <= dHasta; fe = Motor.sumar(fe, 1)) {
      var q = liq.porFecha[fe], cid = diaCentro[fe] || u.centroId;
      if (fCentro && !fCentro[cid]) continue;
      var inc = cubre(ins.incapacidades, fe), per = !inc && cubre(ins.permisos, fe), aus = !!ausentes[fe];
      var costoDia = verCosto ? liq.devengado * (minTot ? (q ? q.trabajadoMin : 0) / minTot : 1 / nDias) * factor : 0;
      if (!q && !inc && !per && !aus && !costoDia) continue;
      var G = grupo(clave(fe, u, cid));
      if (q) {
        if (q.trabajadoMin) { G.dias++; G.personas[u.cedula] = 1; totalPersonas[u.cedula] = 1; }
        G.horas += q.trabajadoMin; G.ordinarias += q.ordinariasMin || 0; G.nocturnas += q.ordNoc + q.domNoc; G.dominicales += q.domDiu + q.domNoc;
        G.extras += q.extraCalculadaMin; G.extrasAprob += q.extDiu + q.extNoc + q.extDomDiu + q.extDomNoc; G.extrasPend += q.extraSinAprobarMin;
        if (q.tardanzaMin) { G.tardanzas++; G.minTarde += q.tardanzaMin; } if (q.incompleto && fe < r.hoy) G.incompletas++;
        (marcasDia[fe] || []).forEach(function (m) { if (m.manual) G.digitadas++; if (m.enZona === '0') G.fueraZona++; });
      }
      if (aus) { G.ausencias++; G.personas[u.cedula] = 1; } if (inc) G.diasIncapacidad++; if (per) G.diasPermiso++;
      G.costo += costoDia;
    }
  });
  var h = function (m) { return Math.round(m / 6) / 10; };
  var filas = Object.keys(g).map(function (k) { var x = g[k];
    return { clave: x.clave, nombre: x.nombre, personas: Object.keys(x.personas).length, dias: x.dias, horas: h(x.horas), ordinarias: h(x.ordinarias), nocturnas: h(x.nocturnas), dominicales: h(x.dominicales),
      extras: h(x.extras), extrasAprob: h(x.extrasAprob), extrasPend: h(x.extrasPend), tardanzas: x.tardanzas, minTarde: x.minTarde, ausencias: x.ausencias, incompletas: x.incompletas, digitadas: x.digitadas, fueraZona: x.fueraZona,
      diasPermiso: x.diasPermiso, diasIncapacidad: x.diasIncapacidad, horasPromedio: x.dias ? Math.round(x.horas / x.dias / 6) / 10 : 0,
      ausentismo: x.dias + x.ausencias ? Math.round(x.ausencias * 1000 / (x.dias + x.ausencias)) / 10 : 0, costo: verCosto ? Math.round(x.costo) : null };
  }).sort(function (a, b) { return ['dia', 'semana', 'mes', 'diaSemana'].indexOf(por) >= 0 ? (a.clave < b.clave ? -1 : 1) : b.horas - a.horas; });
  return { desde: r.desde, hasta: r.hasta, corte: corte, agrupar: por, verCosto: verCosto, factorPrestacional: +c.factorPrestacional || 0, personasConActividad: Object.keys(totalPersonas).length, filas: filas,
    opciones: { centros: centros_().filter(function (x) { return !al || al[x.id]; }).map(function (x) { return { id: x.id, nombre: x.nombre }; }),
      cargos: Object.keys(leer('Usuarios').reduce(function (m, u) { if (!al || al[u.centroId]) m[u.cargo || '-'] = 1; return m; }, {})).sort(),
      personas: leer('Usuarios').filter(function (u) { return u.estado !== 'preregistrado' && (!al || al[u.centroId]); }).map(function (u) { return { cedula: u.cedula, nombre: u.nombre }; }) } };
}

/* El trabajador consulta su propio resumen en cualquier rango (máximo dos meses). */
function a_miResumen(d, u) {
  var r = rango_(d, 62), corte = r.hasta < r.hoy ? r.hasta : r.hoy, ins = insumos_(u, r.desde, r.hasta, corte, leer('Marcaciones', 30000)), liq = Motor.liquidarPeriodo(ins, legal_());
  liq.incompletos = liq.incompletos.filter(function (f) { return f !== r.hoy; });
  var o = sinDetalle_(liq); o.dias = ins.dias.filter(function (x) { return x.fecha >= r.desde && x.fecha <= r.hasta; }).map(function (x) { var q = liq.porFecha[x.fecha] || {};
    return { fecha: x.fecha, entrada: x.entrada || '', salAlm: x.salAlm || '', entAlm: x.entAlm || '', salida: x.salida || '', min: q.trabajadoMin || 0, extra: q.extraCalculadaMin || 0, tarde: q.tardanzaMin || 0, incompleto: !!q.incompleto && x.fecha !== r.hoy }; });
  return o;
}


// ===================== Modulos.gs =====================
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


// ===================== Tareas.gs =====================
/**
 * CONTROL DE JORNADA — Instalación, tareas programadas, copias de seguridad y retención de datos.
 */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Control de jornada')
    .addItem('1. Instalar', 'instalar')
    .addItem('2. Ver el enlace de mi empresa', 'verEnlace')
    .addSeparator()
    .addItem('Ver código del primer administrador', 'verCodigoAdmin')
    .addItem('Hacer copia de seguridad ahora', 'respaldarAhora')
    .addItem('Probar funcionamiento', 'probarFuncionamiento')
    .addToUi();
}
function aviso_(t) { try { SpreadsheetApp.getUi().alert(t); } catch (e) { Logger.log(t); } }

/** Ejecutar UNA vez desde el menú (o desde el editor). Se puede repetir sin perder datos. */
function instalar() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // Una copia de la plantilla trae las propiedades de la original: se descartan para no compartir secreto ni carpetas.
  if (prop_('SS_ID') && prop_('SS_ID') !== ss.getId()) PropertiesService.getScriptProperties().deleteAllProperties();
  prop_('SS_ID', ss.getId());
  Object.keys(HOJAS).forEach(function (n) { var h = hoja_(n); h.getRange(1, 1, 1, HOJAS[n].length).setValues([HOJAS[n]]).setFontWeight('bold'); // encabezados al día tras una actualización
    h.getRange(1, 1, h.getMaxRows(), HOJAS[n].length).setNumberFormat('@'); });
  ['Sesiones', 'Auditoria', 'Errores'].forEach(function (n) { var h = ss.getSheetByName(n); if (h && h.hideSheet) h.hideSheet(); }); // hojas técnicas ocultas
  ['Usuarios', 'Sesiones', 'Marcaciones', 'Nomina', 'Periodos', 'Auditoria'].forEach(function (n) {
    try { var h = ss.getSheetByName(n); if (h && !h.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) h.protect().setDescription('Protegida por Control de jornada').setWarningOnly(true); } catch (e) { }
  });
  if (!prop_('SECRETO')) prop_('SECRETO', azar_() + azar_());
  var raiz = DriveApp.getFileById(ss.getId()).getParents(), padre = raiz.hasNext() ? raiz.next() : DriveApp.getRootFolder();
  if (!prop_('CARPETA_FOTOS')) prop_('CARPETA_FOTOS', padre.createFolder('Control de jornada - Fotos y soportes (privado)').getId());
  if (!prop_('CARPETA_RESPALDOS')) prop_('CARPETA_RESPALDOS', padre.createFolder('Control de jornada - Copias de seguridad').getId());
  var hayAdmin = leer('Usuarios').some(function (u) { return u.rol === 'admin' && u.hash; });
  if (!hayAdmin && !prop_('CODIGO_ADMIN')) prop_('CODIGO_ADMIN', 'ADM-' + azar_().substr(0, 10).toUpperCase());
  if (!cfg_().codigoEmpresa) cfgSet_('codigoEmpresa', codigoLargo_());
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('tareaCada5').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('tareaCada15').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('tareaDiaria').timeBased().atHour(2).everyDays(1).create();
  var s1 = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1'); if (s1 && s1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s1);
  var url = urlServicio_();
  aviso_('Instalación lista.\n\n' + (prop_('CODIGO_ADMIN') ? 'Código del primer administrador (un solo uso): ' + prop_('CODIGO_ADMIN') + '\nLo vuelves a ver en el menú Control de jornada.\n\n' : 'Ya existe un administrador.\n\n') +
    (url ? 'Ya está publicada. Usa el menú «2. Ver el enlace de mi empresa».' : 'Falta un paso: Extensiones → Apps Script → botón azul «Implementar» → «Nueva implementación» → tipo «Aplicación web» → Ejecutar como: Yo · Quién tiene acceso: Cualquier persona → Implementar.\nLuego vuelve aquí y usa el menú «2. Ver el enlace de mi empresa».'));
}
function urlServicio_() { try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; } }
function enlaceEmpresa_() {
  var url = urlServicio_(), m = /\/s\/([A-Za-z0-9_-]{20,})\//.exec(url), app = (cfg_().urlApp || APP_PREDETERMINADA || '').replace(/[#?].*$/, '');
  return { url: url, id: m ? m[1] : '', enlace: m && app ? app + '#/c/' + m[1] : '' };
}
function verEnlace() {
  var e = enlaceEmpresa_();
  if (!e.url) return aviso_('Todavía no está publicada. Extensiones → Apps Script → «Implementar» → «Nueva implementación» → «Aplicación web» → Ejecutar como: Yo · Acceso: Cualquier persona → Implementar. Después vuelve a este menú.');
  var cuerpo = e.enlace ? '<p>Enlace de tu empresa. Ábrelo, ingresa con tu cédula y el código del primer administrador, y compártelo con tu personal:</p><p><a href="' + html_(e.enlace) + '" target="_blank">' + html_(e.enlace) + '</a></p>'
    : '<p>Código de conexión (pégalo en la página de la aplicación):</p><p style="font-family:monospace;word-break:break-all;background:#eee;padding:8px">' + html_(e.id) + '</p>';
  try { SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput('<div style="font-family:sans-serif;line-height:1.5;word-break:break-all">' + cuerpo + '</div>').setWidth(520).setHeight(220), 'Enlace de tu empresa'); } catch (x) { Logger.log(e.enlace || e.id); }
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
  var marc = leer('Marcaciones', 30000), incs = leer('Incapacidades'), cs = {}; centros_().forEach(function (x) { cs[x.id] = x; });
  leer('Usuarios').forEach(function (u) {
    if (u.estado !== 'activo' || !u.email) return;
    var hor = horarioDe_(cs[u.centroId], a.fecha, u.cedula); if (!hor) return;
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
  var a = ahora_(), c = cfg_(), ahoraMin = Motor.aMin(a.hora), marc = leer('Marcaciones', 30000), incs = leer('Incapacidades'), cs = {}; centros_().forEach(function (x) { cs[x.id] = x; });
  var aus = lista_('AVISO_AUSENCIA', a.fecha), inc = lista_('AVISO_INCOMPLETO', a.fecha), fat = lista_('AVISO_FATIGA', a.fecha), ayer = Motor.sumar(a.fecha, -1);
  leer('Usuarios').forEach(function (u) {
    if (u.estado !== 'activo') return;
    var hor = horarioDe_(cs[u.centroId], a.fecha, u.cedula), d = diasDe_(marc, u.cedula, ayer, a.fecha), hoy = null, prev = null;
    d.forEach(function (x) { if (x.fecha === a.fecha) hoy = x; else prev = x; });
    if (hor && !hoy && aus.l.indexOf(u.cedula) < 0 && ahoraMin >= Motor.aMin(hor.e) + (+c.minutosAusencia || 60) && !cubierto_(u.cedula, a.fecha, incs)) {
      aus.l.push(u.cedula); alertar_('ausencia', u.cedula, 'No ha registrado entrada hoy. Su horario empezaba a las ' + hor.e + (cs[u.centroId] ? ' en ' + cs[u.centroId].nombre : '') + ' y no tiene permiso ni incapacidad registrados.');
    }
    // Control de fatiga: jornada abierta que se acerca al máximo de horas continuas
    var ab = hoy && hoy.entrada && !hoy.salida ? hoy : (prev && prev.entrada && !prev.salida ? prev : null);
    if (ab && +c.fatigaHorasMax > 0 && fat.l.indexOf(u.cedula) < 0) {
      var tr = (isoMs_(a.iso) - isoMs_(ab.fecha + 'T' + ab.entrada)) / 60000;
      if (ab.salAlm && ab.entAlm) tr -= Math.max(0, Motor.aMin(ab.entAlm) - Motor.aMin(ab.salAlm));
      if (tr < 16 * 60 && tr >= c.fatigaHorasMax * 60 - (+c.fatigaAvisoMin || 0)) {
        fat.l.push(u.cedula);
        alertar_('fatiga', u.cedula, 'Lleva ' + (Math.round(tr / 6) / 10) + ' h de trabajo continuo desde las ' + ab.entrada + (cs[ab.centroId || u.centroId] ? ' en ' + cs[ab.centroId || u.centroId].nombre : '') + ' y sigue sin marcar salida. Límite configurado: ' + c.fatigaHorasMax + ' h. Verifique su estado y ordene el relevo o el descanso.');
        if (u.email) correo_(u.email, 'Llevas muchas horas de trabajo continuo', 'Hola ' + u.nombre.split(' ')[0] + ', llevas cerca de ' + c.fatigaHorasMax + ' horas de trabajo. Avisa a tu jefe, toma una pausa y, si ya terminaste, marca tu salida: ' + c.urlApp);
      }
    }
    if (prev && prev.entrada && !prev.salida && inc.l.indexOf(u.cedula) < 0 && isoMs_(a.iso) - isoMs_(prev.fecha + 'T' + prev.entrada) > 16 * 3600000) {
      inc.l.push(u.cedula); alertar_('incompleto', u.cedula, 'La jornada del ' + prev.fecha + ' quedó sin salida. Mientras no se complete, ese día no suma horas.');
      if (u.email) correo_(u.email, 'Te faltó marcar la salida de ayer', 'Tu jornada del ' + prev.fecha + ' quedó sin salida. Entra a la aplicación y usa "Se me olvidó marcar" para poner la hora en que saliste: ' + c.urlApp);
    }
  });
  prop_('AVISO_AUSENCIA', JSON.stringify(aus)); prop_('AVISO_INCOMPLETO', JSON.stringify(inc)); prop_('AVISO_FATIGA', JSON.stringify(fat));
  if (c.alertasAgrupadas && unaVez_('digest:' + a.iso.substr(0, 13), 3300)) enviarResumenAlertas_();
}); }

function enviarResumenAlertas_() {
  var pend = leer('Alertas').filter(function (x) { return x.estado === 'pendiente_resumen'; });
  if (!pend.length) return;
  var porCorreo = {}, nombres = {};
  leer('Usuarios').forEach(function (u) { nombres[u.cedula] = u.nombre; });
  pend.forEach(function (x) {
    var dest = x.enviadoA || cfg_().correoAlertas; if (!dest) return;
    (porCorreo[dest] = porCorreo[dest] || []).push(x);
  });
  Object.keys(porCorreo).forEach(function (dest) {
    var lista = porCorreo[dest];
    var cuerpo = 'Resumen de ' + lista.length + ' alerta(s) reciente(s):\n\n' + lista.map(function (x) {
      return '• [' + x.fecha.replace('T', ' ') + '] ' + (TIPOS_ALERTA[x.tipo] || x.tipo) + (x.cedula ? ' — ' + (nombres[x.cedula] || x.cedula) : '') + ': ' + x.detalle;
    }).join('\n');
    var res = correo_(dest, 'Resumen de alertas (' + lista.length + ')', cuerpo);
    lista.forEach(function (x) { x.estado = res && res.indexOf('@') > 0 ? 'enviada' : 'registrada'; x.enviadoA = res || dest; guardar('Alertas', x); });
  });
}

/** Diaria (2:00 a. m.): retención de fotos y GPS, sesiones vencidas, resumen de extras y copia de seguridad. */
function tareaDiaria() { tarea_('diaria', function () {
  var a = ahora_(), c = cfg_();
  limpiarDatos_();
  leer('Sesiones').filter(function (s) { return +s.expira < a.ms; }).sort(function (x, y) { return y._f - x._f; }).forEach(function (s) { borrar('Sesiones', s); });
  var pend = leer('Extras').filter(function (x) { return x.estado === 'pendiente'; }).length;
  if (pend) alertar_('extras_pendientes', '', 'Hay ' + pend + ' registro(s) de horas extra esperando aprobación. Las horas extra sin aprobar no entran a la nómina.');
  // Contratos próximos a vencer (preaviso legal de 30 días en Colombia: avisa desde 35 días antes)
  leer('Usuarios').forEach(function (u) {
    var fin = String(u.finContrato || '').substr(0, 10);
    if (u.estado !== 'activo' || !/^\d{4}-\d\d-\d\d$/.test(fin)) return;
    var faltan = Motor.diasEntre(a.fecha, fin);
    if (faltan >= 0 && faltan <= 35 && unaVez_('vence:' + u.cedula + ':' + fin, 6 * 86400)) {
      alertar_('contrato_vencimiento', u.cedula, 'El contrato (' + (u.tipoContrato || 'término fijo') + ') vence el ' + fin + ' (en ' + faltan + ' día(s)). Recuerda el preaviso legal de 30 días.');
    }
  });
  if (c.archivarMeses > 0) archivarHistorico_();
  // Cruce automático de presupuesto de obras del mes en curso (alerta al 80 % y 100 %)
  try {
    var iniMes = a.fecha.substr(0, 8) + '01', pres = a_adminPresupuestoObras({ desde: iniMes, hasta: a.fecha });
    pres.obras.forEach(function (o) {
      if (o.alerta === 'ok') return;
      if (unaVez_('pres:' + o.centroId + ':' + iniMes + ':' + o.alerta, 25 * 86400)) {
        alertar_('presupuesto_obra', '', 'La obra "' + o.centro + '" está en nivel ' + o.alerta.toUpperCase() + ' de presupuesto (horas: ' + (o.pctHoras || 0) + ' %, costo: ' + (o.pctCosto || 0) + ' %).');
      }
    });
  } catch (e) { }
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
  ['Alertas', 'Errores'].forEach(function (nh) { // las bitácoras con datos personales también caducan
    var hh = hoja_(nh), k = hh.getLastRow() - 1; if (k < 1) return; var vv = hh.getRange(2, 1, k, 1).getValues(), q = 0;
    while (q < vv.length && String(vv[q][0]).substr(0, 10) < limGps) q++; if (q) { hh.deleteRows(2, q); sucio_(nh); } });
  // Retención de soportes de permisos e incapacidades
  var limSop = Motor.sumar(a.fecha, -(c.retencionSoportesDias || 365)), sopBorrados = 0;
  [['Permisos', 'fechaRegreso'], ['Incapacidades', 'hasta']].forEach(function (par) {
    leer(par[0]).forEach(function (r) {
      if (r.soporte && r[par[1]] && String(r[par[1]]).substr(0, 10) < limSop && sopBorrados < 200) {
        try { DriveApp.getFileById(String(r.soporte)).setTrashed(true); } catch (e) { }
        r.soporte = ''; guardar(par[0], r); sopBorrados++;
      }
    });
  });
  prop_('ULTIMA_LIMPIEZA', a.iso + ' · ' + borradas + ' foto(s), ' + sopBorrados + ' soporte(s) eliminado(s)');
}

/** Archiva marcaciones antiguas de periodos ya cerrados para mantener ágil la hoja activa. */
function archivarHistorico_() {
  var a = ahora_(), c = cfg_(), meses = +c.archivarMeses || 12;
  var lim = Motor.sumar(a.fecha, -meses * 30), h = hoja_('Marcaciones'), cols = HOJAS.Marcaciones, n = h.getLastRow() - 1;
  if (n < 500) return; // solo archiva cuando ya hay volumen relevante
  var iF = cols.indexOf('fecha'), v = h.getRange(2, 1, n, cols.length).getValues(), mover = [], conservar = [];
  for (var i = 0; i < v.length; i++) {
    var f = String(v[i][iF]).substr(0, 10);
    if (f && f < lim && periodoCerrado_(f)) mover.push(v[i]); else conservar.push(v[i]);
  }
  if (mover.length < 100) return;
  try {
    var carpeta = DriveApp.getFolderById(prop_('CARPETA_RESPALDOS'));
    var nombre = 'Histórico Marcaciones ' + a.fecha.substr(0, 4) + ' - ' + c.empresa.nombre;
    var it = carpeta.getFilesByName(nombre), archSs = it.hasNext() ? SpreadsheetApp.openById(it.next().getId()) : SpreadsheetApp.create(nombre);
    if (!it.hasNext()) { try { DriveApp.getFileById(archSs.getId()).moveTo(carpeta); } catch (e) { } }
    var ah = archSs.getSheetByName('Marcaciones') || archSs.insertSheet('Marcaciones');
    if (ah.getLastRow() === 0) ah.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    ah.getRange(ah.getLastRow() + 1, 1, mover.length, cols.length).setValues(mover);
    h.getRange(2, 1, n, cols.length).clearContent();
    if (conservar.length) h.getRange(2, 1, conservar.length, cols.length).setValues(conservar);
    sucio_('Marcaciones');
    auditar_('sistema', 'archivar_historico', { archivadas: mover.length, archivo: nombre });
  } catch (e) { registrarError_('archivar_historico', e); }
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
