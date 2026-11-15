import React, { useEffect, useState } from 'react';
import { CalendarCheck, Check, Download, Lock, MessageCircle, Pencil, Plus, RefreshCw, Save, Stethoscope, Timer, X, DatabaseBackup, FileText } from 'lucide-react';
import { api, VERSION } from './api.js';
import { Aviso, Boton, Campo, Casilla, Confirmar, Estado, Hoja, Insignia, Pestanas, Tabla, Tarjeta, Vacio, useAvisos, useCarga, useForm } from './ui.jsx';
import { comprimirArchivo, fechaCorta, fechaHora, horas, horasDec, hoyISO, pesos, sumarDias } from './util.js';
import { DetallePermiso, nombreEstado, tonoPermiso } from './Firma.jsx';
import { Desprendible, Liquidacion, enlaceWhatsApp, textoPermiso } from './Trabajador.jsx';
import { Rango, Titulo, aExcel, periodoActual, useAccion } from './Admin.jsx';

/* ---------- Permisos ---------- */
export function Permisos() {
  const carga = useCarga(() => api('adminPermisos'), []), [filtro, setFiltro] = useState('pendientes'), [sel, setSel] = useState(null), [obs, setObs] = useState(''), [rem, setRem] = useState(true), [correr, ocupado] = useAccion();
  const abrir = (p) => { setSel(p); setObs(''); setRem(p.remunerado); };
  const decidir = async (decision) => { if (await correr(() => api('adminPermisoDecidir', { id: sel.id, decision, obs, remunerado: rem }), decision === 'aprobar' ? 'Permiso aprobado: ya cuenta para la nómina.' : 'Permiso rechazado.')) { setSel(null); carga.recargar(true); } };
  const sinFirmas = sel && sel.estado !== 'firmado';
  return <><Titulo t="Permisos">Un permiso solo afecta la nómina cuando tú lo apruebas aquí, después de las firmas de los jefes.</Titulo>
    <div style={{ marginBottom: 16 }}><Pestanas etiqueta="Filtro de permisos" valor={filtro} alCambiar={setFiltro} opciones={[{ v: 'pendientes', t: 'Por decidir' }, { v: 'en_firmas', t: 'En firmas' }, { v: 'todos', t: 'Todos' }]} /></div>
    <Estado carga={carga}>{(l) => <Tabla columnas={[
      { k: 'nombre', t: 'Persona', render: (p) => <strong>{p.nombre}</strong> }, { k: 'tipoNombre', t: 'Tipo', render: (p) => <>{p.tipoNombre}<div className="suave chico">{p.remunerado ? 'Remunerado' : 'No remunerado'}</div></> },
      { k: 'fechaSalida', t: 'Sale', render: (p) => `${fechaCorta(p.fechaSalida)} ${p.horaSalida}` }, { k: 'fechaRegreso', t: 'Regresa', render: (p) => `${fechaCorta(p.fechaRegreso)} ${p.horaRegreso}` },
      { k: 'firmas', t: 'Firmas', orden: false, render: (p) => p.firmas.length ? `${p.firmas.filter((f) => f.estado === 'aprobado').length} de ${p.firmas.length}` : '—' },
      { k: 'estado', t: 'Estado', render: (p) => <Insignia tono={tonoPermiso[p.estado]}>{nombreEstado[p.estado]}</Insignia>, texto: (p) => nombreEstado[p.estado] },
      { k: 'a', t: '', acciones: true, orden: false, render: (p) => <Boton chico variante={['firmado', 'vencido'].includes(p.estado) ? 'primario' : 'secundario'} onClick={() => abrir(p)}>{['firmado', 'vencido'].includes(p.estado) ? 'Decidir' : 'Ver'}</Boton> }]}
      filas={l.filter((p) => filtro === 'todos' || (filtro === 'pendientes' ? ['firmado', 'vencido'].includes(p.estado) : p.estado === 'en_firmas'))} clave={(p) => p.id}
      vacio={filtro === 'pendientes' ? 'No hay permisos esperando tu decisión.' : 'No hay permisos en esta lista.'} />}</Estado>
    <Hoja abierta={!!sel} alCerrar={() => setSel(null)} titulo="Solicitud de permiso" alto={0.92}>{sel && <>
      <Insignia tono={tonoPermiso[sel.estado]}>{nombreEstado[sel.estado]}</Insignia>
      <DetallePermiso p={sel} />{sel.obs && <p className="suave chico">{sel.obs}</p>}
      <h3>Firmas</h3>
      {sel.firmas.length === 0 ? <Aviso tono="aviso">No hay jefes configurados para este centro. Agrégalos en Configuración → Jefes que firman.</Aviso> :
        <ul className="lista">{sel.firmas.map((f) => <li key={f.id}><div className="crece"><strong>{f.nombre}</strong><div className="suave chico">{f.cargo}{f.fecha ? ` · ${fechaHora(f.fecha)}` : ''}{f.obs ? ` · ${f.obs}` : ''}</div>{f.firma && <img src={f.firma} alt={`Firma de ${f.nombre}`} style={{ height: 48, background: '#fff', borderRadius: 6, marginTop: 4 }} />}</div>
          {f.estado === 'pendiente' && f.enlace && f.whatsapp ? <a className="btn secundario chico" href={enlaceWhatsApp(f.whatsapp, textoPermiso(sel, f))} target="_blank" rel="noreferrer"><MessageCircle size={16} aria-hidden="true" />Recordar</a> : <Insignia tono={f.estado === 'aprobado' ? 'ok' : f.estado === 'rechazado' ? 'peligro' : 'aviso'}>{f.estado}</Insignia>}</li>)}</ul>}
      {['firmado', 'en_firmas', 'vencido'].includes(sel.estado) && <>
        {sinFirmas && <Aviso tono="aviso">Faltan firmas. Puedes decidir sin ellas, pero debes escribir la justificación; queda en auditoría.</Aviso>}
        {!['ley', 'vacaciones'].includes(sel.cat) && <Casilla checked={rem} onChange={(e) => setRem(e.target.checked)}>Permiso remunerado (si no, se descuenta el tiempo)</Casilla>}
        <Campo como="textarea" etiqueta={sinFirmas ? 'Justificación' : 'Observación (obligatoria si rechazas)'} value={obs} onChange={(e) => setObs(e.target.value)} maxLength={300} />
        <div className="acciones-hoja"><Boton variante="peligro" icono={X} cargando={ocupado} disabled={obs.trim().length < 5} onClick={() => decidir('rechazar')}>Rechazar</Boton><Boton icono={Check} cargando={ocupado} disabled={sinFirmas && obs.trim().length < 5} onClick={() => decidir('aprobar')}>Aprobar</Boton></div></>}
    </>}</Hoja></>;
}

/* ---------- Horas extra ---------- */
export function Extras() {
  const [filtro, setFiltro] = useState('pendiente'), carga = useCarga(() => api('adminExtras', { estado: filtro === 'todas' ? '' : filtro }), [filtro]), [sel, setSel] = useState(null), [min, setMin] = useState(0), [obs, setObs] = useState(''), [tope, setTope] = useState(false), [correr, ocupado] = useAccion();
  const abrir = (x) => { setSel(x); setMin(Math.min(x.minCalc, x.superaDia ? 120 : x.minCalc)); setObs(''); setTope(false); };
  const decidir = async (decision) => { if (await correr(() => api('adminExtraDecidir', { id: sel.id, decision, min, obs, confirmaTope: tope }), decision === 'aprobar' ? 'Horas extra aprobadas.' : 'Horas extra rechazadas.')) { setSel(null); carga.recargar(true); } };
  return <><Titulo t="Horas extra">La aplicación calcula el tiempo trabajado por encima de la jornada. Solo lo que apruebes aquí entra a la nómina.</Titulo>
    <div style={{ marginBottom: 16 }}><Pestanas etiqueta="Filtro de horas extra" valor={filtro} alCambiar={setFiltro} opciones={[{ v: 'pendiente', t: 'Por aprobar' }, { v: 'aprobada', t: 'Aprobadas' }, { v: 'rechazada', t: 'Rechazadas' }, { v: 'todas', t: 'Todas' }]} /></div>
    <Estado carga={carga}>{(l) => <Tabla columnas={[
      { k: 'fecha', t: 'Fecha', render: (x) => <span>{fechaCorta(x.fecha)}</span> }, { k: 'nombre', t: 'Persona', render: (x) => <strong>{x.nombre}</strong> },
      { k: 'minCalc', t: 'Calculadas', num: true, render: (x) => horas(x.minCalc) }, { k: 'minAprob', t: 'Aprobadas', num: true, render: (x) => x.minAprob === null ? '—' : horas(x.minAprob), valor: (x) => x.minAprob || 0 },
      { k: 'av', t: 'Avisos', orden: false, render: (x) => <span className="fila" style={{ gap: 4 }}>{x.superaDia && <Insignia tono="peligro">más de 2 h en el día</Insignia>}{x.superaSemana && <Insignia tono="peligro">más de 12 h en la semana</Insignia>}{x.obs && <span className="suave chico">{x.obs}</span>}</span> },
      { k: 'estado', t: 'Estado', render: (x) => <Insignia tono={{ pendiente: 'aviso', aprobada: 'ok', rechazada: 'peligro' }[x.estado]}>{x.estado}</Insignia> },
      { k: 'a', t: '', acciones: true, orden: false, render: (x) => x.cerrado ? <Insignia>cerrado</Insignia> : <Boton chico variante={x.estado === 'pendiente' ? 'primario' : 'secundario'} onClick={() => abrir(x)}>{x.estado === 'pendiente' ? 'Decidir' : 'Cambiar'}</Boton> }]}
      filas={l} clave={(x) => x.id} vacio={filtro === 'pendiente' ? 'No hay horas extra por aprobar.' : 'No hay registros.'} />}</Estado>
    <Hoja abierta={!!sel} alCerrar={() => setSel(null)} titulo="Aprobar horas extra" alto={0.75}>{sel && <>
      <p><strong>{sel.nombre}</strong> · {fechaCorta(sel.fecha)}. Tiempo extra calculado: <strong className="num">{horas(sel.minCalc)}</strong>.</p>
      <Campo etiqueta="Minutos que apruebas" type="number" min="1" max={sel.minCalc} value={min} onChange={(e) => setMin(+e.target.value)} ayuda={`Equivale a ${horas(min)}. Máximo ${sel.minCalc} min.`} />
      {min > 120 && <><Aviso tono="peligro">Supera el máximo legal de <strong>2 horas extra por día</strong> (y 12 por semana). Solo procede con autorización del Ministerio del Trabajo o en las excepciones de ley.</Aviso>
        <Casilla checked={tope} onChange={(e) => setTope(e.target.checked)}>Confirmo que la empresa cuenta con el soporte para superar el tope. Queda registrado con mi usuario.</Casilla></>}
      <Campo etiqueta="Observación" value={obs} onChange={(e) => setObs(e.target.value)} maxLength={200} />
      <div className="acciones-hoja"><Boton variante="secundario" cargando={ocupado} onClick={() => decidir('rechazar')}>Rechazar</Boton><Boton cargando={ocupado} disabled={!(min > 0) || min > sel.minCalc || (min > 120 && !tope)} onClick={() => decidir('aprobar')}>Aprobar {horas(min)}</Boton></div></>}</Hoja></>;
}

/* ---------- Incapacidades ---------- */
const TIPO_INC = { general: 'Enfermedad general', laboral: 'Accidente o enfermedad laboral', maternidad: 'Licencia de maternidad', paternidad: 'Licencia de paternidad' };
export function Incapacidades() {
  const carga = useCarga(() => api('adminIncapacidades'), []), personas = useCarga(() => api('adminPersonal'), []), [nuevo, setNuevo] = useState(false), [borrar, setBorrar] = useState(null), [f, campo, setF] = useForm({}), [soporte, setSoporte] = useState(''), [correr, ocupado] = useAccion(), avisos = useAvisos();
  const abrir = () => { setF({ cedula: '', tipo: 'general', desde: hoyISO(), hasta: hoyISO(), entidad: '', nota: '' }); setSoporte(''); setNuevo(true); };
  const guardar = async () => { if (await correr(() => api('adminIncapacidadGuardar', { ...f, soporte }), 'Incapacidad registrada.')) { setNuevo(false); carga.recargar(true); } };
  const eliminar = async () => { if (await correr(() => api('adminIncapacidadGuardar', { ...borrar, borrar: true }), 'Incapacidad eliminada.')) { setBorrar(null); carga.recargar(true); } };
  return <><Titulo t="Incapacidades" accion={<Boton icono={Plus} onClick={abrir}>Registrar incapacidad</Boton>}>Los días de incapacidad no cuentan como ausencia y se liquidan según su tipo. No se guarda el diagnóstico.</Titulo>
    <Estado carga={carga}>{(l) => <Tabla columnas={[{ k: 'nombre', t: 'Persona', render: (i) => <strong>{i.nombre}</strong> }, { k: 'tipo', t: 'Tipo', render: (i) => TIPO_INC[i.tipo], texto: (i) => TIPO_INC[i.tipo] }, { k: 'desde', t: 'Desde', render: (i) => fechaCorta(i.desde) }, { k: 'hasta', t: 'Hasta', render: (i) => fechaCorta(i.hasta) }, { k: 'dias', t: 'Días', num: true }, { k: 'entidad', t: 'Entidad' },
      { k: 'a', t: '', acciones: true, orden: false, render: (i) => <Boton chico variante="texto" onClick={() => setBorrar(i)}>Eliminar</Boton> }]} filas={l} clave={(i) => i.id} vacio="No hay incapacidades registradas." />}</Estado>
    <Hoja abierta={nuevo} alCerrar={() => setNuevo(false)} titulo="Registrar incapacidad">
      <Campo como="select" etiqueta="Persona" {...campo('cedula')}><option value="">Elige…</option>{(personas.datos || []).filter((u) => u.estado !== 'inactivo').map((u) => <option key={u.cedula} value={u.cedula}>{u.nombre}</option>)}</Campo>
      <Campo como="select" etiqueta="Tipo" opciones={Object.keys(TIPO_INC).map((k) => ({ v: k, t: TIPO_INC[k] }))} {...campo('tipo')} />
      {f.tipo === 'general' && <Aviso>Se liquida al 66,67 % del salario, sin bajar del mínimo diario. Los dos primeros días los asume el empleador y desde el tercero la EPS.</Aviso>}
      <div className="rejilla"><Campo etiqueta="Desde" type="date" {...campo('desde')} /><Campo etiqueta="Hasta (incluido)" type="date" min={f.desde} {...campo('hasta')} /></div>
      <Campo etiqueta="Entidad que la expide" placeholder="EPS, ARL o IPS" {...campo('entidad')} /><Campo etiqueta="Nota interna" ayuda="No escribas el diagnóstico." {...campo('nota')} />
      <div className="campo"><label htmlFor="sinc">Soporte (foto del certificado, opcional)</label><input id="sinc" className="entrada" style={{ paddingTop: 10 }} type="file" accept="image/*" onChange={async (e) => { const a = e.target.files[0]; if (!a) return setSoporte(''); try { setSoporte(await comprimirArchivo(a)); } catch (x) { avisos.error(x); } }} /></div>
      <div className="acciones-hoja"><Boton variante="secundario" onClick={() => setNuevo(false)}>Cancelar</Boton><Boton cargando={ocupado} disabled={!f.cedula} onClick={guardar}>Registrar</Boton></div>
    </Hoja>
    <Confirmar abierta={!!borrar} titulo="Eliminar incapacidad" texto="Eliminar" variante="peligro" cargando={ocupado} alCerrar={() => setBorrar(null)} alConfirmar={eliminar}>Los días volverán a contarse como ausencia si la persona no marcó.</Confirmar></>;
}

/* ---------- Nómina ---------- */
export function Nomina({ cfg }) {
  const [tab, setTab] = useState('previa'), [r, setR] = useState(() => periodoActual(cfg.periodoNomina)), previa = useCarga(() => api('adminNominaPrevia', r, { espera: 120000 }), [r.desde, r.hasta]), cerradas = useCarga(() => api('adminNominas'), [tab]);
  const [sel, setSel] = useState(null), [cerrar, setCerrar] = useState(false), [det, setDet] = useState(null), [desp, setDesp] = useState(null), [correr, ocupado] = useAccion();
  const hacerCierre = async () => { if (await correr(() => api('adminNominaCerrar', r, { espera: 180000 }), 'Periodo cerrado: los desprendibles ya están disponibles para cada trabajador.')) { setCerrar(false); previa.recargar(); setTab('cerradas'); } };
  const verCerrada = async (p) => { const l = await correr(() => api('adminNominaDetalle', p)); if (l) setDet({ p, l }); };
  if (desp) return <Desprendible n={desp} alVolver={() => setDesp(null)} />;
  return <><Titulo t="Nómina y desprendibles">Liquidación estimada con la normativa vigente. Al cerrar el periodo se generan los desprendibles y ese periodo queda congelado.</Titulo>
    <div style={{ marginBottom: 16 }}><Pestanas etiqueta="Vista de nómina" valor={tab} alCambiar={(v) => { setTab(v); setDet(null); }} opciones={[{ v: 'previa', t: 'Periodo por liquidar' }, { v: 'cerradas', t: 'Periodos cerrados' }]} /></div>
    {tab === 'previa' ? <>
      <div className="fila entre" style={{ marginBottom: 16, alignItems: 'flex-end' }}><Rango r={r} setR={setR} />
        <Boton icono={Lock} disabled={!previa.datos || previa.datos.cerrado || r.hasta >= hoyISO()} onClick={() => setCerrar(true)}>Cerrar periodo</Boton></div>
      <Estado carga={previa} lineas={8}>{(d) => <div className="pila">
        {d.cerrado && <Aviso>Este rango ya tiene una nómina cerrada. Consúltala en «Periodos cerrados».</Aviso>}
        {!d.cerrado && r.hasta >= hoyISO() && <Aviso>El periodo sigue en curso: los valores van hasta {fechaCorta(d.corte)} y podrás cerrarlo desde el {fechaCorta(sumarDias(r.hasta, 1))}.</Aviso>}
        {d.extrasPendientes > 0 && <Aviso tono="aviso"><strong>{d.extrasPendientes} registro(s) de horas extra sin aprobar</strong> en este periodo: no se están pagando.</Aviso>}
        {d.permisosPendientes > 0 && <Aviso tono="aviso"><strong>{d.permisosPendientes} permiso(s) sin resolver</strong>: mientras no se aprueben, esos días cuentan como ausencia.</Aviso>}
        <div className="indicadores"><div className="indicador n-info"><span className="valor">{d.filas.length}</span><span className="rotulo">Personas</span></div><div className="indicador"><span className="valor">{pesos(d.filas.reduce((s, x) => s + x.liq.devengado, 0))}</span><span className="rotulo">Total devengado</span></div><div className="indicador n-ok"><span className="valor">{pesos(d.filas.reduce((s, x) => s + x.liq.neto, 0))}</span><span className="rotulo">Neto a pagar</span></div></div>
        <Tabla columnas={[{ k: 'nombre', t: 'Persona', render: (x) => <><strong>{x.nombre}</strong>{!x.salarioOk && <div><Insignia tono="aviso">salario sin validar</Insignia></div>}</> }, { k: 'centro', t: 'Centro' },
          { k: 'h', t: 'Horas', num: true, valor: (x) => x.liq.horas.trabajadas, render: (x) => horasDec(x.liq.horas.trabajadas) }, { k: 'e', t: 'Extra', num: true, valor: (x) => x.liq.horas.extras, render: (x) => <>{horasDec(x.liq.horas.extras)}{x.liq.horas.extrasSinAprobar > 0 && <div className="suave chico">+{horasDec(x.liq.horas.extrasSinAprobar)} sin aprobar</div>}</> },
          { k: 'au', t: 'Ausencias', num: true, valor: (x) => x.liq.ausencias, render: (x) => x.liq.ausencias || '' }, { k: 'dev', t: 'Devengado', num: true, valor: (x) => x.liq.devengado, render: (x) => pesos(x.liq.devengado) }, { k: 'neto', t: 'Neto', num: true, valor: (x) => x.liq.neto, render: (x) => <strong>{pesos(x.liq.neto)}</strong> },
          { k: 'a', t: '', acciones: true, orden: false, render: (x) => <Boton chico variante="secundario" onClick={() => setSel(x)}>Detalle</Boton> }]} filas={d.filas} clave={(x) => x.cedula} vacio="No hay personal con salario para liquidar en este periodo." />
      </div>}</Estado></> :
      det ? <div className="pila"><div className="fila entre"><Boton variante="texto" onClick={() => setDet(null)}>← Periodos</Boton><Boton variante="secundario" icono={Download} onClick={() => aExcel({ 'Nómina': det.l.map((n) => { const q = n.detalle, v = (c) => q.conceptos.filter((k) => c.includes(k.cod)).reduce((s, k) => s + k.valor, 0); return { 'Cédula': n.cedula, Nombre: n.nombre, 'Días': q.diasNomina, 'Horas trabajadas': q.horas.trabajadas, 'Horas extra': q.horas.extras, Ausencias: q.ausencias, 'Salario básico': v(['SAL']), Recargos: v(['RN', 'DF', 'DFN']), 'Horas extra $': v(['HED', 'HEN', 'HEDF', 'HENF']), 'Auxilio transporte': v(['AUX']), Devengado: q.devengado, Deducciones: q.deducciones, Neto: q.neto }; }) }, `nomina-${det.p.desde}-a-${det.p.hasta}.xlsx`)}>Descargar Excel</Boton></div>
        <Tabla columnas={[{ k: 'nombre', t: 'Persona', render: (n) => <strong>{n.nombre}</strong> }, { k: 'cedula', t: 'Cédula' }, { k: 'neto', t: 'Neto pagado', num: true, render: (n) => pesos(n.neto) }, { k: 'a', t: '', acciones: true, orden: false, render: (n) => <Boton chico variante="secundario" icono={FileText} onClick={() => setDesp(n)}>Desprendible</Boton> }]} filas={det.l} clave={(n) => n.id} /></div> :
        <Estado carga={cerradas}>{(l) => <Tabla buscar={false} columnas={[{ k: 'desde', t: 'Periodo', render: (p) => <strong>{fechaCorta(p.desde)} – {fechaCorta(p.hasta)}</strong> }, { k: 'personas', t: 'Personas', num: true }, { k: 'neto', t: 'Neto total', num: true, render: (p) => pesos(p.neto) }, { k: 'cerradoEl', t: 'Cerrado', render: (p) => fechaHora(p.cerradoEl) },
          { k: 'a', t: '', acciones: true, orden: false, render: (p) => <Boton chico variante="secundario" cargando={ocupado} onClick={() => verCerrada(p)}>Ver desprendibles</Boton> }]} filas={l} clave={(p) => p.desde} vacio="Aún no se ha cerrado ningún periodo." />}</Estado>}
    <Hoja abierta={!!sel} alCerrar={() => setSel(null)} titulo={sel ? sel.nombre : ''}>{sel && <><p className="suave chico">{sel.liq.diasNomina} días liquidados · {horasDec(sel.liq.horas.trabajadas)} trabajadas · {sel.liq.tardanzas} tardanza(s) · valor hora {pesos(sel.liq.valorHora)}</p><Liquidacion l={sel.liq} />
      {sel.liq.ausentes.length > 0 && <Aviso tono="aviso">Ausencias: {sel.liq.ausentes.map(fechaCorta).join(', ')}</Aviso>}{sel.liq.incompletos.length > 0 && <Aviso tono="aviso">Jornadas sin salida (no suman horas): {sel.liq.incompletos.map(fechaCorta).join(', ')}</Aviso>}</>}</Hoja>
    <Confirmar abierta={cerrar} titulo="Cerrar el periodo" texto="Cerrar y generar desprendibles" cargando={ocupado} alCerrar={() => setCerrar(false)} alConfirmar={hacerCierre}>
      <p>Del {fechaCorta(r.desde)} al {fechaCorta(r.hasta)}. Después del cierre <strong>no se podrán cambiar</strong> marcaciones, permisos, extras ni incapacidades de esas fechas.</p>
      {previa.datos && (previa.datos.extrasPendientes > 0 || previa.datos.permisosPendientes > 0) && <Aviso tono="peligro">Aún hay horas extra o permisos sin resolver en este periodo. Si cierras ahora, no se pagarán.</Aviso>}</Confirmar></>;
}

/* ---------- Resumen por obra + exportación general ---------- */
export function Obras({ cfg }) {
  const [r, setR] = useState(() => periodoActual(cfg.periodoNomina)), carga = useCarga(() => api('adminResumenObra', r, { espera: 120000 }), [r.desde, r.hasta]), [correr, ocupado] = useAccion();
  const exportar = () => correr(async () => { const d = await api('adminExportar', r, { espera: 180000 }), { desde, hasta, empresa, ...hojas } = d; await aExcel(hojas, `jornada-${desde}-a-${hasta}.xlsx`); }, 'Archivo de Excel descargado.');
  return <><Titulo t="Resumen por obra" accion={<Boton icono={Download} cargando={ocupado} onClick={exportar}>Descargar todo a Excel</Boton>}>Horas, novedades y costo por centro de trabajo. El Excel trae personal, jornadas, extras, permisos, incapacidades, nómina y este resumen.</Titulo>
    <div style={{ marginBottom: 16 }}><Rango r={r} setR={setR} /></div>
    <Estado carga={carga}>{(d) => <Tabla buscar={false} columnas={[{ k: 'centro', t: 'Centro de trabajo', render: (o) => <strong>{o.centro}</strong> }, { k: 'personas', t: 'Personas', num: true }, { k: 'dias', t: 'Días-persona', num: true }, { k: 'horas', t: 'Horas', num: true, render: (o) => horasDec(o.horas) }, { k: 'extras', t: 'Extra', num: true, render: (o) => horasDec(o.extras) }, { k: 'tardanzas', t: 'Tardanzas', num: true }, { k: 'ausencias', t: 'Ausencias', num: true }, { k: 'costo', t: 'Costo devengado', num: true, render: (o) => pesos(o.costo) }]}
      filas={d.obras} clave={(o) => o.centroId} vacio="No hay actividad en ese rango." />}</Estado>
    <p className="suave chico" style={{ marginTop: 12 }}>Las horas se cuentan en la obra donde se marcó. El costo corresponde al devengado del personal asignado a cada centro (sin prestaciones ni aportes del empleador).</p></>;
}

/* ---------- Alertas ---------- */
export function Alertas() {
  const carga = useCarga(() => api('adminConfig'), []), bit = useCarga(() => api('adminBitacoras', { cual: 'alertas' }), []), [tab, setTab] = useState('config'), [f, setF] = useState(null), [correr, ocupado] = useAccion();
  useEffect(() => { if (carga.datos && !f) { const c = carga.datos; setF({ correoAlertas: c.correoAlertas, minutosAusencia: c.minutosAusencia, recordatorioMin: c.recordatorioMin, recordatorioCorreo: c.recordatorioCorreo, alertas: Object.fromEntries(Object.keys(c.tiposAlerta).map((k) => [k, { activo: c.alertas[k]?.activo !== false, correos: c.alertas[k]?.correos || '' }])) }); } }, [carga.datos]); // eslint-disable-line
  const pon = (k, campo, v) => setF((x) => ({ ...x, alertas: { ...x.alertas, [k]: { ...x.alertas[k], [campo]: v } } }));
  return <><Titulo t="Alertas">Qué situaciones avisan por correo y a quién. Cada alerta puede tener sus propios destinatarios.</Titulo>
    <div style={{ marginBottom: 16 }}><Pestanas etiqueta="Vista de alertas" valor={tab} alCambiar={setTab} opciones={[{ v: 'config', t: 'Configurar' }, { v: 'historial', t: 'Historial' }]} /></div>
    {tab === 'config' ? <Estado carga={carga}>{(c) => f && <div className="pila">
      <Tarjeta titulo="Destinatarios y tiempos"><div className="pila">
        <Campo etiqueta="Correo general de alertas" type="text" placeholder="rrhh@empresa.co, jefe@empresa.co" ayuda="Varios correos separados por coma. Lo usa toda alerta que no tenga destinatarios propios." value={f.correoAlertas} onChange={(e) => setF({ ...f, correoAlertas: e.target.value })} />
        <div className="rejilla"><Campo etiqueta="Avisar ausencia a los (min)" type="number" min="5" ayuda="Minutos después de la hora de entrada sin marcar." value={f.minutosAusencia} onChange={(e) => setF({ ...f, minutosAusencia: e.target.value })} />
          <Campo etiqueta="Recordatorio de marcación (min)" type="number" min="0" ayuda="Antes de entrar y después de la hora de salida; igual en el almuerzo." value={f.recordatorioMin} onChange={(e) => setF({ ...f, recordatorioMin: e.target.value })} /></div>
        <Casilla checked={f.recordatorioCorreo} onChange={(e) => setF({ ...f, recordatorioCorreo: e.target.checked })}>Enviar además el recordatorio por correo al trabajador que no ha marcado (llega aunque tenga la aplicación cerrada)</Casilla>
      </div></Tarjeta>
      <Tarjeta titulo="Tipos de alerta"><div className="pila junta">{Object.keys(c.tiposAlerta).map((k) => <div key={k} className="fila" style={{ alignItems: 'flex-end', borderTop: '1px solid var(--c-borde)', paddingTop: 12 }}>
        <label className="fila crece" style={{ minWidth: 220, flexWrap: 'nowrap' }}><input type="checkbox" checked={f.alertas[k].activo} onChange={(e) => pon(k, 'activo', e.target.checked)} style={{ width: 22, height: 22, accentColor: 'var(--c-primario)' }} /><strong>{c.tiposAlerta[k]}</strong></label>
        <input className="entrada crece" style={{ minWidth: 220 }} aria-label={`Destinatarios de: ${c.tiposAlerta[k]}`} placeholder="Usa el correo general" disabled={!f.alertas[k].activo} value={f.alertas[k].correos} onChange={(e) => pon(k, 'correos', e.target.value)} /></div>)}</div></Tarjeta>
      <div className="fila fin"><Boton icono={Save} cargando={ocupado} onClick={() => correr(() => api('adminConfigGuardar', f), 'Alertas guardadas.')}>Guardar alertas</Boton></div>
    </div>}</Estado> :
      <Estado carga={bit}>{(l) => <Tabla columnas={[{ k: 'fecha', t: 'Fecha', render: (a) => fechaHora(a.fecha) }, { k: 'tipo', t: 'Alerta', render: (a) => carga.datos?.tiposAlerta[a.tipo] || a.tipo }, { k: 'cedula', t: 'Cédula' }, { k: 'detalle', t: 'Detalle' }, { k: 'estado', t: 'Envío', render: (a) => <Insignia tono={a.estado === 'enviada' ? 'ok' : a.estado === 'desactivada' ? '' : 'aviso'}>{a.estado}</Insignia> }]} filas={l} vacio="Aún no se han generado alertas." />}</Estado>}</>;
}

/* ---------- Configuración ---------- */
const PCT = ['recargoNocturno', 'extraDiurna', 'extraNocturna', 'recargoDominical', 'pctSalud', 'pctPension'];
export function Config({ centros, recargarYo }) {
  const carga = useCarga(() => api('adminConfig'), []), [tab, setTab] = useState('empresa'), [f, setF] = useState(null), [L, setL] = useState(null), [jefe, setJefe] = useState(null), [correr, ocupado] = useAccion(), avisos = useAvisos();
  useEffect(() => { const c = carga.datos; if (!c) return; setF(c); const e = c.legalEfectivo, l = { ...e, festivosExtra: (e.festivosExtra || []).join(', ') }; PCT.forEach((k) => { l[k] = e[k] === null || e[k] === undefined ? '' : Math.round(e[k] * 10000) / 100; }); setL(l); }, [carga.datos]);
  const pon = (k, v) => setF((x) => ({ ...x, [k]: v })), emp = (k, v) => setF((x) => ({ ...x, empresa: { ...x.empresa, [k]: v } }));
  const guardar = async (datos, msg) => { const r = await correr(() => api('adminConfigGuardar', datos), msg || 'Configuración guardada.'); if (r) { carga.recargar(true); recargarYo(); } };
  const guardarLegal = () => { const l = { ...L, festivosExtra: String(L.festivosExtra).split(/[,\s]+/).filter(Boolean) }; PCT.forEach((k) => { l[k] = L[k] === '' ? '' : +L[k] / 100; }); guardar({ legal: l }, 'Parámetros legales guardados.'); };
  const logo = async (e) => { const a = e.target.files[0]; if (!a) return; try { const u = await comprimirArchivo(a, 240, 0.8); emp('logo', u); } catch (x) { avisos.error(x); } };
  const num = (k, t, ayuda, extra) => <Campo etiqueta={t} type="number" min="0" ayuda={ayuda} value={f[k]} onChange={(e) => pon(k, e.target.value)} {...extra} />;
  const leg = (k, t, ayuda, tipo = 'number') => <Campo etiqueta={t} type={tipo} step="any" ayuda={ayuda} value={L[k] ?? ''} onChange={(e) => setL({ ...L, [k]: e.target.value })} />;
  return <><Titulo t="Configuración">Todo lo propio de la empresa se ajusta aquí, sin tocar el código.</Titulo>
    <div style={{ marginBottom: 16 }}><Pestanas etiqueta="Secciones de configuración" valor={tab} alCambiar={setTab} opciones={[{ v: 'empresa', t: 'Empresa' }, { v: 'reglas', t: 'Reglas de marcación' }, { v: 'jefes', t: 'Jefes que firman' }, { v: 'legal', t: 'Parámetros legales' }, { v: 'datos', t: 'Datos y respaldo' }]} /></div>
    <Estado carga={carga}>{() => f && L && <div className="pila">
      {tab === 'empresa' && <Tarjeta titulo="Datos de la empresa"><div className="pila">
        <div className="rejilla"><Campo etiqueta="Razón social" value={f.empresa.nombre} onChange={(e) => emp('nombre', e.target.value)} /><Campo etiqueta="NIT" value={f.empresa.nit} onChange={(e) => emp('nit', e.target.value)} /></div>
        <div className="rejilla"><Campo etiqueta="Dirección" value={f.empresa.direccion} onChange={(e) => emp('direccion', e.target.value)} /><Campo etiqueta="Teléfono" value={f.empresa.telefono} onChange={(e) => emp('telefono', e.target.value)} /></div>
        <div className="rejilla"><div className="campo"><label htmlFor="logo">Logo</label><div className="fila">{f.empresa.logo && <img src={f.empresa.logo} alt="Logo actual" style={{ height: 44, background: '#fff', borderRadius: 6 }} />}<input id="logo" className="entrada crece" style={{ paddingTop: 10 }} type="file" accept="image/*" onChange={logo} /></div></div>
          <Campo etiqueta="Color principal" type="color" ayuda="Se aplica al encabezado y los botones (modo claro)." value={f.empresa.color || '#0E4A5A'} onChange={(e) => emp('color', e.target.value)} /></div>
        <div className="rejilla"><Campo etiqueta="Correo para derechos de datos personales" type="email" ayuda="Aparece en la política de privacidad." value={f.empresa.correoDatos} onChange={(e) => emp('correoDatos', e.target.value)} /><Campo etiqueta="Área responsable de los datos" value={f.empresa.responsableDatos} onChange={(e) => emp('responsableDatos', e.target.value)} /></div>
        <Campo etiqueta="Titular del software" ayuda="Aparece en la página de propiedad intelectual." value={f.empresa.titularSoftware} onChange={(e) => emp('titularSoftware', e.target.value)} />
        <Campo como="select" etiqueta="Periodo de nómina" value={f.periodoNomina} onChange={(e) => pon('periodoNomina', e.target.value)} opciones={[{ v: 'quincenal', t: 'Quincenal' }, { v: 'mensual', t: 'Mensual' }]} />
        <div className="fila fin"><Boton icono={Save} cargando={ocupado} onClick={() => guardar({ empresa: f.empresa, periodoNomina: f.periodoNomina })}>Guardar</Boton></div></div></Tarjeta>}

      {tab === 'reglas' && <Tarjeta titulo="Reglas de marcación y permisos"><div className="pila">
        <div className="rejilla">{num('fotoProbabilidad', 'Foto al azar (% de marcaciones)', '0 = nunca, 100 = siempre.', { max: 100 })}{num('radioDefecto', 'Radio por defecto de un centro (m)')}</div>
        <Casilla checked={f.geocercaEstricta} onChange={(e) => pon('geocercaEstricta', e.target.checked)}>Impedir la marcación fuera del radio del centro de trabajo. Si está apagado, se deja marcar pero se genera una alerta.</Casilla>
        <div className="rejilla">{num('toleranciaMin', 'Tolerancia de llegada por defecto (min)')}{num('diasAtrasManual', 'Días hacia atrás para “Se me olvidó marcar”')}</div>
        <div className="rejilla">{num('horasLimitePermiso', 'Límite para responder un permiso (horas)', 'Pasado este tiempo sin todas las firmas, vence y te llega una alerta.')}{num('sesionDias', 'Duración de la sesión (días)', 'El usuario permanece ingresado en su celular este tiempo.')}</div>
        <Casilla checked={f.aprobacionFinalAdmin} onChange={(e) => pon('aprobacionFinalAdmin', e.target.checked)}>Después de las firmas de los jefes, exigir la aprobación final del administrador (recomendado)</Casilla>
        <Casilla checked={f.autoRegistro} onChange={(e) => pon('autoRegistro', e.target.checked)}>Permitir que personas no cargadas se registren con el código de la empresa (quedan pendientes de tu aprobación)</Casilla>
        {f.autoRegistro && <Campo etiqueta="Código de la empresa" ayuda="Compártelo solo con tu personal. Cámbialo si se filtra." value={f.codigoEmpresa} onChange={(e) => pon('codigoEmpresa', e.target.value)} />}
        <div className="fila fin"><Boton icono={Save} cargando={ocupado} onClick={() => guardar(Object.fromEntries(['fotoProbabilidad', 'radioDefecto', 'geocercaEstricta', 'toleranciaMin', 'diasAtrasManual', 'horasLimitePermiso', 'sesionDias', 'aprobacionFinalAdmin', 'autoRegistro', 'codigoEmpresa'].map((k) => [k, f[k]])))}>Guardar</Boton></div></div></Tarjeta>}

      {tab === 'jefes' && <Tarjeta titulo="Jefes que firman los permisos" accion={<Boton chico icono={Plus} onClick={() => setJefe({ nombre: '', cargo: '', email: '', whatsapp: '', centros: [], activo: true, pin: '' })}>Agregar jefe</Boton>}>
        <p className="suave chico" style={{ marginBottom: 12 }}>Cada permiso debe ser firmado por todos los jefes activos del centro de trabajo del solicitante. Firman desde un enlace que reciben por WhatsApp o correo, con su clave personal.</p>
        {f.jefes.length === 0 ? <Vacio titulo="Sin jefes configurados">Mientras no haya jefes, los permisos pasan directo a tu aprobación.</Vacio> :
          <ul className="lista">{f.jefes.map((j) => <li key={j.id}><div className="crece"><strong>{j.nombre}</strong> {!j.activo && <Insignia>inactivo</Insignia>}<div className="suave chico">{j.cargo} · {j.centros.length ? j.centros.map((id) => centros.find((c) => c.id === id)?.nombre).filter(Boolean).join(', ') : 'todos los centros'}{j.whatsapp ? ` · WhatsApp ${j.whatsapp}` : ''}</div></div><Boton chico variante="secundario" icono={Pencil} onClick={() => setJefe({ ...j, pin: '' })}>Editar</Boton></li>)}</ul>}</Tarjeta>}

      {tab === 'legal' && <Tarjeta titulo="Parámetros legales de liquidación"><div className="pila">
        <Aviso>Valores por defecto vigentes a noviembre de 2026: jornada de 42 h (Ley 2101 de 2021), trabajo nocturno desde las 19:00 y recargo dominical escalonado (Ley 2466 de 2025). Actualízalos cuando cambie el salario mínimo o la norma.</Aviso>
        <div className="rejilla">{leg('jornadaSemanalH', 'Jornada máxima semanal (h)')}{leg('divisorMensual', 'Divisor mensual de la hora', 'Salario ÷ este número = valor de la hora.')}</div>
        <div className="rejilla">{leg('nocheInicio', 'Inicio de jornada nocturna', '', 'time')}{leg('nocheFin', 'Fin de jornada nocturna', '', 'time')}</div>
        <div className="rejilla">{leg('recargoNocturno', 'Recargo nocturno (%)')}{leg('recargoDominical', 'Recargo dominical y festivo (%)', 'Vacío = escalonado de ley: 90 % hasta jun-2027, luego 100 %.')}</div>
        <div className="rejilla">{leg('extraDiurna', 'Hora extra diurna (%)')}{leg('extraNocturna', 'Hora extra nocturna (%)')}</div>
        <div className="rejilla">{leg('maxExtraDiaH', 'Máximo de horas extra por día')}{leg('maxExtraSemanaH', 'Máximo de horas extra por semana')}</div>
        <div className="rejilla">{leg('smmlv', 'Salario mínimo mensual ($)')}{leg('auxTransporte', 'Auxilio de transporte mensual ($)')}</div>
        <div className="rejilla">{leg('pctSalud', 'Aporte del trabajador a salud (%)')}{leg('pctPension', 'Aporte del trabajador a pensión (%)')}</div>
        {leg('festivosExtra', 'Días de descanso adicionales de la empresa', 'Fechas AAAA-MM-DD separadas por coma. Los festivos nacionales se calculan solos cada año.', 'text')}
        <div className="fila fin"><Boton icono={Save} cargando={ocupado} onClick={guardarLegal}>Guardar parámetros</Boton></div></div></Tarjeta>}

      {tab === 'datos' && <Tarjeta titulo="Conservación de datos y copias de seguridad"><div className="pila">
        <div className="rejilla">{num('retencionFotosDias', 'Conservar las fotos (días)', 'Luego se eliminan solas.')}{num('retencionGpsDias', 'Conservar las coordenadas GPS (días)', 'Luego se borran; la marcación se conserva.')}</div>
        <div className="rejilla">{num('respaldoCadaDias', 'Copia de seguridad cada (días)', '0 = desactivada.')}{num('respaldoConservar', 'Copias que se conservan')}</div>
        <Campo etiqueta="Versión de las políticas" ayuda="Si la cambias, todos deberán autorizar de nuevo el tratamiento de datos al entrar." value={f.versionLegal} onChange={(e) => pon('versionLegal', e.target.value)} />
        <div className="fila fin"><Boton icono={Save} cargando={ocupado} onClick={() => guardar(Object.fromEntries(['retencionFotosDias', 'retencionGpsDias', 'respaldoCadaDias', 'respaldoConservar', 'versionLegal'].map((k) => [k, f[k]])))}>Guardar</Boton></div></div></Tarjeta>}
    </div>}</Estado>
    <Hoja abierta={!!jefe} alCerrar={() => setJefe(null)} titulo={jefe?.id ? 'Editar jefe' : 'Agregar jefe'}>{jefe && <>
      <div className="rejilla"><Campo etiqueta="Nombre" required value={jefe.nombre} onChange={(e) => setJefe({ ...jefe, nombre: e.target.value })} /><Campo etiqueta="Cargo" value={jefe.cargo} onChange={(e) => setJefe({ ...jefe, cargo: e.target.value })} /></div>
      <div className="rejilla"><Campo etiqueta="WhatsApp" inputMode="numeric" ayuda="Celular de 10 dígitos." value={jefe.whatsapp} onChange={(e) => setJefe({ ...jefe, whatsapp: e.target.value })} /><Campo etiqueta="Correo" type="email" ayuda="Recibe el enlace de firma y la constancia." value={jefe.email} onChange={(e) => setJefe({ ...jefe, email: e.target.value })} /></div>
      <Campo etiqueta={jefe.tienePin ? 'Nueva clave de firma (deja vacío para no cambiarla)' : 'Clave de firma'} type="password" inputMode="numeric" autoComplete="new-password" ayuda="4 a 8 números. Entrégasela solo al jefe: con ella firma los permisos." value={jefe.pin} onChange={(e) => setJefe({ ...jefe, pin: e.target.value.replace(/\D/g, '') })} />
      <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="pila junta"><legend className="etiqueta">Centros donde firma (ninguno marcado = todos)</legend>{centros.map((c) => <Casilla key={c.id} checked={jefe.centros.includes(c.id)} onChange={(e) => setJefe({ ...jefe, centros: e.target.checked ? [...jefe.centros, c.id] : jefe.centros.filter((x) => x !== c.id) })}>{c.nombre}</Casilla>)}</fieldset>
      <Casilla checked={jefe.activo} onChange={(e) => setJefe({ ...jefe, activo: e.target.checked })}>Activo</Casilla>
      <div className="acciones-hoja"><Boton variante="secundario" onClick={() => setJefe(null)}>Cancelar</Boton><Boton cargando={ocupado} onClick={async () => { if (await correr(() => api('adminJefeGuardar', jefe), 'Jefe guardado.')) { setJefe(null); carga.recargar(true); } }}>Guardar jefe</Boton></div></>}</Hoja></>;
}

/* ---------- Sistema: monitoreo, errores, pruebas, respaldo, auditoría ---------- */
export function Sistema() {
  const salud = useCarga(() => api('adminSalud', {}, { espera: 90000 }), []), [tab, setTab] = useState('salud'), bit = useCarga(() => (tab === 'salud' ? Promise.resolve([]) : api('adminBitacoras', { cual: tab })), [tab]), [correr, ocupado] = useAccion();
  const NOMBRE_TAREA = { tareaCada5: 'Recordatorios y vencimiento de permisos (cada 5 min)', tareaCada15: 'Ausencias y jornadas sin salida (cada 15 min)', tareaDiaria: 'Limpieza de datos y copia de seguridad (diaria)' };
  return <><Titulo t="Sistema y respaldo" accion={<Boton variante="secundario" icono={RefreshCw} cargando={salud.cargando} onClick={() => salud.recargar()}>Revisar de nuevo</Boton>}>Estado del servicio, pruebas de funcionamiento, copias de seguridad, errores y auditoría.</Titulo>
    <div style={{ marginBottom: 16 }}><Pestanas etiqueta="Vista del sistema" valor={tab} alCambiar={setTab} opciones={[{ v: 'salud', t: 'Estado' }, { v: 'errores', t: 'Errores' }, { v: 'auditoria', t: 'Auditoría' }]} /></div>
    {tab === 'salud' ? <Estado carga={salud} lineas={8}>{(s) => <div className="pila">
      <div className="indicadores">
        <div className={`indicador n-${s.pruebas.every((p) => p.ok) ? 'ok' : 'peligro'}`}><span className="valor">{s.pruebas.filter((p) => p.ok).length}/{s.pruebas.length}</span><span className="rotulo">Pruebas correctas</span></div>
        <div className={`indicador n-${s.errores7d ? 'aviso' : 'ok'}`}><span className="valor">{s.errores7d}</span><span className="rotulo">Errores en 7 días</span></div>
        <div className={`indicador n-${s.disparadores.length >= 3 ? 'ok' : 'peligro'}`}><span className="valor">{s.disparadores.length}/3</span><span className="rotulo">Tareas automáticas</span></div>
        <div className={`indicador n-${s.cupoCorreo !== null && s.cupoCorreo < 15 ? 'peligro' : ''}`}><span className="valor">{s.cupoCorreo ?? '—'}</span><span className="rotulo">Correos disponibles hoy</span></div>
        <div className={`indicador n-${s.capacidad > 80 ? 'peligro' : ''}`}><span className="valor">{s.capacidad} %</span><span className="rotulo">Capacidad usada</span></div>
      </div>
      {s.disparadores.length < 3 && <Aviso tono="peligro">Faltan tareas automáticas: no habrá alertas de ausencia ni copias de seguridad. Abre la hoja de cálculo → menú «Control de jornada» → «Instalar o reparar».</Aviso>}
      <div className="rejilla dos">
        <Tarjeta titulo="Pruebas de funcionamiento"><ul className="lista">{s.pruebas.map((p) => <li key={p.nombre}>{p.ok ? <Check size={18} color="var(--c-ok)" aria-hidden="true" /> : <X size={18} color="var(--c-peligro)" aria-hidden="true" />}<span className="crece">{p.nombre}</span><Insignia tono={p.ok ? 'ok' : 'peligro'}>{p.ok ? 'correcta' : 'falló'}</Insignia></li>)}</ul></Tarjeta>
        <Tarjeta titulo="Copia de seguridad"><div className="pila"><p>Última copia: <strong>{s.ultimoRespaldo ? fechaHora(s.ultimoRespaldo) : 'aún no se ha hecho'}</strong></p><p className="suave chico">Se guarda una copia completa de la hoja de cálculo en la carpeta «Copias de seguridad» de tu Drive. Para restaurar: abre la copia y úsala como hoja principal (pasos en LEEME.md).</p>
          <p className="suave chico">Última limpieza de datos: {s.ultimaLimpieza ? s.ultimaLimpieza.replace('T', ' ') : 'pendiente'}</p>
          <Boton variante="secundario" icono={DatabaseBackup} cargando={ocupado} onClick={async () => { await correr(() => api('adminRespaldar', {}, { espera: 120000 }), 'Copia de seguridad creada.'); salud.recargar(true); }}>Hacer copia ahora</Boton></div></Tarjeta>
      </div>
      <Tarjeta titulo="Detalle"><ul className="lista chico">{s.disparadores.map((t) => <li key={t}><span className="crece">{NOMBRE_TAREA[t] || t}</span><Insignia tono="ok">activa</Insignia></li>)}
        <li><span className="crece">Registros guardados</span><span className="num">{Object.keys(s.filas).map((k) => `${k}: ${s.filas[k]}`).join(' · ')}</span></li>
        <li><span className="crece">Versión</span><span className="num">servidor {s.version} · aplicación {VERSION}</span></li></ul></Tarjeta>
    </div>}</Estado> :
      <Estado carga={bit}>{(l) => tab === 'errores' ? <Tabla columnas={[{ k: 'fecha', t: 'Fecha', render: (e) => fechaHora(e.fecha) }, { k: 'origen', t: 'Origen' }, { k: 'mensaje', t: 'Mensaje' }, { k: 'cedula', t: 'Usuario' }, { k: 'equipo', t: 'Equipo', render: (e) => <span className="chico suave">{e.equipo}</span> }, { k: 'version', t: 'Versión' }]} filas={l} vacio="No hay errores registrados." />
        : <Tabla columnas={[{ k: 'fecha', t: 'Fecha', render: (a) => fechaHora(a.fecha) }, { k: 'actor', t: 'Quién' }, { k: 'accion', t: 'Acción' }, { k: 'detalle', t: 'Detalle', render: (a) => <span className="chico" style={{ wordBreak: 'break-word' }}>{a.detalle}</span> }]} filas={l} vacio="Aún no hay movimientos." />}</Estado>}</>;
}
