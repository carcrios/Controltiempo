import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SwipeToConfirm } from '@elizabthpazp/intera-ui';
import { Bell, CalendarDays, Camera, Check, Clock, Download, FileText, History, KeyRound, LogOut, MapPin, MessageCircle, Plus, Printer, ArrowLeft, UserRound, Wallet } from 'lucide-react';
import { api, bandeja, reintentable } from './api.js';
import { Aviso, Boton, Campo, Estado, Hoja, Insignia, Tarjeta, Vacio, useAvisos, useCarga, useForm, useOscuro, Confirmar } from './ui.jsx';
import { ErrorPermiso, NOMBRE_TIPO, CORTO_TIPO, TIPOS, ahoraISO, comprimir, comprimirArchivo, fechaCorta, fechaLarga, horas, horasDec, hoyISO, idNuevo, notificacionesActivas, pedirNotificaciones, pesos, programarRecordatorios, sumarDias, ubicar } from './util.js';
import { DetallePermiso, nombreEstado, tonoPermiso } from './Firma.jsx';
import { PieLegal } from './Legal.jsx';

/* ---------- Cámara: la foto se toma en el momento y se comprime en el celular ---------- */
function Camara({ tipo, alTerminar }) {
  const video = useRef(null), flujo = useRef(null), [lista, setLista] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error(), { name: 'NotSupportedError' });
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 } }, audio: false });
        if (!vivo) return s.getTracks().forEach((t) => t.stop());
        flujo.current = s; video.current.srcObject = s; await video.current.play(); setLista(true);
      } catch (e) { setError(e.name === 'NotAllowedError' ? 'La cámara está bloqueada. Para marcar debes permitirla: toca el candado junto a la dirección de la página → Permisos → Cámara → Permitir.' : 'No se pudo abrir la cámara de este dispositivo.'); }
    })();
    return () => { vivo = false; flujo.current?.getTracks().forEach((t) => t.stop()); };
  }, []);
  return <div className="camara" role="dialog" aria-modal="true" aria-label="Tomar foto para la marcación">
    {error ? <div className="barra" style={{ flex: 1, justifyContent: 'center' }}><Camera size={40} aria-hidden="true" /><p role="alert">{error}</p><Boton variante="acento" onClick={() => alTerminar(null, true)}>Entendido</Boton></div> : <>
      <video ref={video} playsInline muted aria-label="Vista de la cámara frontal" />
      <div className="barra"><p><strong>{NOMBRE_TIPO[tipo]}:</strong> esta marcación pide una foto de tu rostro.</p>
        <button className="disparo" disabled={!lista} aria-label="Tomar la foto" onClick={() => alTerminar(comprimir(video.current))} />
        <Boton variante="texto" style={{ color: '#fff' }} onClick={() => alTerminar(null, false)}>Cancelar (no se registrará la marcación)</Boton></div></>}
  </div>;
}

function Reloj() {
  const [t, setT] = useState(new Date());
  useEffect(() => { const i = setInterval(() => setT(new Date()), 1000); return () => clearInterval(i); }, []);
  const p = (n) => String(n).padStart(2, '0');
  return <div className="reloj" role="timer" aria-label={`Son las ${p(t.getHours())} y ${p(t.getMinutes())}`}><span>{p(t.getHours())}:{p(t.getMinutes())}</span><small>{p(t.getSeconds())}</small></div>;
}

/* ---------- Inicio: tarjeta de tiempo + resumen de horas y dinero ---------- */
function Inicio({ yo, actualizar, recargar }) {
  const { hoy, resumen, centros, usuario, cfg } = yo, avisos = useAvisos(), oscuro = useOscuro();
  const [fase, setFase] = useState(null), [vuelta, setVuelta] = useState(0), [bloqueo, setBloqueo] = useState(null), [camara, setCamara] = useState(null), [olvido, setOlvido] = useState(false), [detalle, setDetalle] = useState(false);
  const [centroSel, setCentroSel] = useState(hoy.centroId || usuario.centroId || ''), [pend, setPend] = useState(() => bandeja.lista().length);
  const pedirFoto = (tipo) => new Promise((ok) => setCamara({ tipo, ok }));

  const enviarPendientes = useCallback(async () => {
    if (!bandeja.lista().length || !navigator.onLine) return;
    const r = await bandeja.enviar(); setPend(r.pendientes);
    if (r.enviadas) { avisos.ok(`${r.enviadas} marcación(es) guardada(s) sin señal ya se enviaron.`); recargar(); }
    r.rechazadas.forEach((m) => avisos.error(`No se aceptó “${NOMBRE_TIPO[m.tipo]}” de las ${m.hora.slice(11)}: ${m.rechazo}`, 14000));
  }, [avisos, recargar]);
  useEffect(() => { enviarPendientes(); window.addEventListener('online', enviarPendientes); return () => window.removeEventListener('online', enviarPendientes); }, [enviarPendientes]);
  useEffect(() => { programarRecordatorios(hoy, cfg.recordatorioMin); }, [hoy, cfg.recordatorioMin]);

  async function marcar(tipo, extra = {}) {
    const fin = () => { setFase(null); setVuelta((v) => v + 1); };
    setBloqueo(null); setFase('gps');
    let pos;
    try { pos = await ubicar(); }
    catch (e) { fin(); setBloqueo(e instanceof ErrorPermiso ? e : new ErrorPermiso('gps', 'No se pudo obtener la ubicación.', false)); if (e.bloqueado) api('bloqueo', { que: 'gps', tipo }).catch(() => {}); return false; }
    const m = { id: idNuevo(), tipo, ...pos, centroId: centroSel, hora: ahoraISO(), ...extra };
    const tomar = async () => {
      setFase('foto'); const foto = await pedirFoto(tipo);
      if (!foto) { fin(); setBloqueo(new ErrorPermiso('camara', 'Sin la foto no se puede registrar esta marcación. Vuelve a deslizar y toma la foto.', true)); api('bloqueo', { que: 'camara', tipo }).catch(() => {}); return false; }
      m.foto = foto; return true;
    };
    if (!extra.manual && hoy.fotoPlan?.[tipo] && !(await tomar())) return false;
    for (let intento = 0; intento < 2; intento++) {
      setFase('enviando');
      try {
        const r = await api('marcar', m); actualizar({ hoy: r.hoy, resumen: r.resumen }); fin();
        avisos.ok(`${NOMBRE_TIPO[tipo]} registrada a las ${r.hora.slice(11)}.` + (r.enZona === '0' ? ` Quedó fuera del centro de trabajo (${r.dist} m).` : ''));
        if (navigator.vibrate) navigator.vibrate(120); return true;
      } catch (e) {
        if (e.cod === 'FOTO_REQUERIDA' && !m.foto) { if (!(await tomar())) return false; continue; }
        if (reintentable(e)) {
          bandeja.agregar(m); setPend(bandeja.lista().length);
          if (!extra.manual) { const marcas = { ...hoy.marcas, [tipo]: m.hora.slice(11) }; actualizar({ hoy: { ...hoy, marcas, siguiente: tipo === 'salida' ? null : TIPOS[TIPOS.indexOf(tipo) + 1] } }); }
          fin(); avisos.info(`Sin señal: “${NOMBRE_TIPO[tipo]}” quedó guardada en tu celular y se enviará sola al volver la conexión.`, 8000); return true;
        }
        fin(); avisos.error(e); return false;
      }
    }
    fin(); return false;
  }

  const sig = hoy.siguiente, m = hoy.marcas || {}, ocupado = !!fase, h = hoy.horario;
  const textoFase = { gps: 'Obteniendo tu ubicación…', foto: 'Esperando la foto…', enviando: 'Registrando…' }[fase];
  return <div className="pila">
    <section className="reloj-tarjeta" aria-label="Tarjeta de tiempo de hoy">
      <div className="fila entre"><span className="fecha">{fechaLarga(hoy.fecha)}{hoy.festivo ? ' · festivo' : ''}</span>{h && <span className="chico" style={{ opacity: .85 }}>Horario {h.e}–{h.s}</span>}</div>
      <Reloj />
      <ol className="riel" aria-label="Marcaciones de la jornada">{TIPOS.map((t) => { const omit = !m[t] && TIPOS.some((x) => TIPOS.indexOf(x) > TIPOS.indexOf(t) && m[x]);
        return <li key={t} className={m[t] ? 'hecho' : t === sig ? 'sigue' : omit ? 'omitido' : ''} aria-current={t === sig ? 'step' : undefined}><span className="marca-p">{m[t] && <Check size={13} strokeWidth={3.5} aria-hidden="true" />}</span><span>{CORTO_TIPO[t]}</span><span className="hora-p">{m[t] || (omit ? 'sin marcar' : '')}</span></li>; })}</ol>
      <div className="zona-marcar">
        {sig ? <>
          {centros.length > 1 && !m.entrada && <label className="fila chico" style={{ gap: 8 }}><MapPin size={16} aria-hidden="true" />Estoy en
            <select className="entrada" style={{ width: 'auto', minHeight: 36, maxWidth: 220 }} value={centroSel} onChange={(e) => setCentroSel(e.target.value)}>{centros.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>}
          {ocupado ? <div className="fila" role="status" aria-live="polite" style={{ minHeight: 68 }}><span className="giro" aria-hidden="true" /><span className="que">{textoFase}</span></div>
            : <div className="desliza" style={{ width: '100%', display: 'grid', placeItems: 'center' }}><SwipeToConfirm key={vuelta + sig} label={`Desliza: ${NOMBRE_TIPO[sig].toLowerCase()}`} successLabel="Un momento…" allowReset={false} darkMode={oscuro} onConfirm={() => marcar(sig)} /></div>}
          {!ocupado && <div className="fila" style={{ justifyContent: 'center' }}>
            <Boton variante="texto" chico onClick={() => marcar(sig)}>Marcar con un toque</Boton>
            {sig === 'sal_alm' && <Boton variante="texto" chico onClick={() => marcar('salida')}>Marcar salida del día</Boton>}
            {sig === 'ent_alm' && <Boton variante="texto" chico onClick={() => marcar('salida')}>No regreso: marcar salida</Boton>}
          </div>}
        </> : <p className="que" role="status">Jornada de hoy completa. ¡Buen descanso!</p>}
      </div>
    </section>

    {bloqueo && <Aviso tono="peligro"><strong>{bloqueo.que === 'camara' ? 'Falta la foto' : 'Falta la ubicación'}.</strong> {bloqueo.message}{bloqueo.bloqueado && ' Se avisó al administrador de este intento.'}</Aviso>}
    {pend > 0 && <Aviso tono="aviso"><strong>{pend} marcación(es) por enviar.</strong> Están guardadas en este celular; se envían solas al volver la señal. <Boton chico variante="secundario" onClick={enviarPendientes}>Enviar ahora</Boton></Aviso>}
    {resumen.incompletos?.length > 0 && <Aviso tono="aviso"><strong>Te faltó marcar la salida</strong> el {resumen.incompletos.map(fechaCorta).join(', ')}. Mientras no la completes, ese día no suma horas. <Boton chico variante="secundario" onClick={() => setOlvido({ tipo: 'salida', fecha: resumen.incompletos[0] })}>Poner la hora en que salí</Boton></Aviso>}
    <Boton variante="secundario" icono={History} onClick={() => setOlvido({ tipo: sig || 'salida', fecha: hoy.fecha })}>Se me olvidó marcar</Boton>

    <Tarjeta titulo="Lo que llevas este periodo" accion={<span className="suave chico">{fechaCorta(resumen.periodo.desde)} – {fechaCorta(resumen.periodo.hasta)}</span>}>
      <div className="rejilla">
        <div className="dato-grande"><span className="suave chico">Horas trabajadas</span><span className="valor xl">{horasDec(resumen.horas.trabajadas)}</span></div>
        <div className="dato-grande"><span className="suave chico">Llevas ganado (neto estimado)</span><span className="valor xl" style={{ color: 'var(--c-ok)' }}>{pesos(resumen.neto)}</span></div>
      </div>
      <p className="suave chico" style={{ marginTop: 12 }}>Si completas el periodo sin novedades te pueden llegar cerca de <strong className="num" style={{ color: 'var(--c-texto)' }}>{pesos(resumen.proyeccion)}</strong>. Es un estimado; el valor oficial es el del desprendible.{!usuario.salarioOk && ' Tu salario aún no ha sido validado por el administrador.'}</p>
      <div className="fila" style={{ marginTop: 12 }}>
        {resumen.horas.extras > 0 && <Insignia tono="ok">{horasDec(resumen.horas.extras)} extra aprobadas</Insignia>}
        {resumen.horas.extrasSinAprobar > 0 && <Insignia tono="aviso">{horasDec(resumen.horas.extrasSinAprobar)} extra por aprobar</Insignia>}
        {resumen.tardanzas > 0 && <Insignia tono="aviso">{resumen.tardanzas} llegada(s) tarde</Insignia>}
        {resumen.ausencias > 0 && <Insignia tono="peligro">{resumen.ausencias} ausencia(s)</Insignia>}
        <Boton variante="texto" chico onClick={() => setDetalle(true)}>Ver cómo se calcula</Boton>
      </div>
    </Tarjeta>

    <Tarjeta titulo="Mis jornadas del periodo">
      {resumen.dias.length === 0 ? <Vacio icono={CalendarDays} titulo="Aún no hay jornadas">Tu primera marcación de este periodo aparecerá aquí.</Vacio> :
        <ul className="lista">{[...resumen.dias].reverse().map((d) => <li key={d.fecha}><div className="crece"><strong>{fechaCorta(d.fecha)}</strong>
          <div className="suave chico num">{d.entrada || '—'} → {d.salida || (d.incompleto ? 'sin salida' : 'en curso')}{d.salAlm ? ` · almuerzo ${d.salAlm}${d.entAlm ? '–' + d.entAlm : ''}` : ''}</div></div>
          <div className="derecha"><span className="num">{d.incompleto ? '—' : horas(d.min)}</span><div className="fila fin" style={{ gap: 4 }}>{d.tarde > 0 && <Insignia tono="aviso">+{d.tarde} min</Insignia>}{d.extra > 0 && <Insignia tono="info">{horas(d.extra)} extra</Insignia>}{d.incompleto && <Insignia tono="peligro">incompleta</Insignia>}</div></div></li>)}</ul>}
    </Tarjeta>

    {camara && <Camara tipo={camara.tipo} alTerminar={(foto) => { camara.ok(foto); setCamara(null); }} />}
    <Olvido abierta={!!olvido} inicial={olvido || {}} cfg={cfg} hoy={hoy} alCerrar={() => setOlvido(false)} alEnviar={async (d) => { const ok = await marcar(d.tipo, { manual: true, fecha: d.fecha, hora: `${d.fechaHora}T${d.hora}`, motivo: d.motivo }); if (ok) { setOlvido(false); recargar(); } }} ocupado={ocupado} />
    <Hoja abierta={detalle} alCerrar={() => setDetalle(false)} titulo="Cómo se calcula tu estimado"><Liquidacion l={resumen} /><p className="suave chico">Valor de tu hora ordinaria: {pesos(resumen.valorHora)} (salario ÷ divisor mensual vigente). Las horas extra solo se pagan cuando el administrador las aprueba.</p></Hoja>
  </div>;
}

function Olvido({ abierta, inicial, cfg, hoy, alCerrar, alEnviar, ocupado }) {
  const [f, campo, setF] = useForm({ tipo: 'salida', fecha: hoy.fecha, hora: '', motivo: '', otroDia: false }), [err, setErr] = useState('');
  useEffect(() => { if (abierta) { setF({ tipo: inicial.tipo || 'salida', fecha: inicial.fecha || hoy.fecha, hora: '', motivo: '', otroDia: false }); setErr(''); } }, [abierta]); // eslint-disable-line
  const dias = Array.from({ length: (cfg.diasAtrasManual || 3) + 1 }, (_, i) => sumarDias(hoyISO(), -i));
  const enviar = () => { if (!f.hora) return setErr('Indica la hora.'); if (f.motivo.trim().length < 5) return setErr('Explica brevemente por qué no marcaste a tiempo.'); setErr('');
    alEnviar({ tipo: f.tipo, fecha: f.fecha, fechaHora: f.otroDia ? sumarDias(f.fecha, 1) : f.fecha, hora: f.hora, motivo: f.motivo.trim() }); };
  return <Hoja abierta={abierta} alCerrar={alCerrar} titulo="Se me olvidó marcar">
    <p className="suave">Escribe la hora real. La marcación queda señalada como digitada y el administrador la revisa.</p>
    <Campo como="select" etiqueta="¿Qué te faltó marcar?" opciones={TIPOS.map((t) => ({ v: t, t: NOMBRE_TIPO[t] }))} {...campo('tipo')} />
    <div className="rejilla"><Campo como="select" etiqueta="Día de la jornada" opciones={dias.map((d) => ({ v: d, t: fechaLarga(d) }))} {...campo('fecha')} /><Campo etiqueta="Hora real" type="time" {...campo('hora')} /></div>
    {f.tipo !== 'entrada' && <label className="fila chico"><input type="checkbox" {...campo('otroDia', 'check')} style={{ width: 20, height: 20 }} />El turno terminó después de medianoche (día siguiente)</label>}
    <Campo como="textarea" etiqueta="Motivo" maxLength={200} placeholder="Ej.: se me descargó el celular" {...campo('motivo')} />
    {err && <Aviso tono="peligro">{err}</Aviso>}
    <div className="acciones-hoja"><Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton><Boton cargando={ocupado} onClick={enviar}>Registrar hora</Boton></div>
  </Hoja>;
}

export function Liquidacion({ l }) {
  return <div>
    {l.conceptos.map((c) => <div className="concepto" key={c.cod}><span>{c.concepto}</span><span className="cant num">{c.cantidad}</span><span className={`num ${c.valor < 0 ? 'neg' : ''}`}>{pesos(c.valor)}</span></div>)}
    <div className="total" style={{ borderTopWidth: 1, fontWeight: 600 }}><span>Total devengado</span><span className="num">{pesos(l.devengado)}</span></div>
    {l.deduccionesDet.map((c) => <div className="concepto" key={c.cod}><span>{c.concepto}</span><span className="cant num">{c.cantidad}</span><span className="num neg">− {pesos(c.valor)}</span></div>)}
    <div className="total" style={{ marginTop: 8 }}><span>Neto</span><span className="num" style={{ fontSize: 'var(--t-5)' }}>{pesos(l.neto)}</span></div>
  </div>;
}

export function Desprendible({ n, alVolver }) {
  const d = n.detalle, p = d.persona || {}, e = d.empresa || {};
  return <div className="pila">
    <div className="fila entre no-imprimir"><Boton variante="texto" icono={ArrowLeft} onClick={alVolver}>Volver</Boton><Boton variante="secundario" icono={Printer} onClick={() => window.print()}>Imprimir o guardar PDF</Boton></div>
    <Tarjeta>
      <div className="fila entre" style={{ alignItems: 'flex-start', marginBottom: 16 }}><div><h2>Desprendible de pago</h2><p className="suave">{e.nombre}{e.nit ? ` · NIT ${e.nit}` : ''}</p></div><div className="derecha"><strong>{fechaCorta(n.desde)} – {fechaCorta(n.hasta)}</strong><div className="suave chico">Generado {fechaCorta(n.generado)}</div></div></div>
      <div className="rejilla" style={{ marginBottom: 16 }}>
        <div><span className="suave chico">Trabajador</span><div><strong>{p.nombre}</strong></div><div className="chico">C.C. {p.cedula}{p.cargo ? ` · ${p.cargo}` : ''}</div></div>
        <div><span className="suave chico">Salario base</span><div className="num"><strong>{pesos(p.salario)}</strong> {p.tipoPago === 'dia' ? 'por día' : 'mensual'}</div><div className="chico">{p.centro}</div></div>
        <div><span className="suave chico">Jornada</span><div className="chico">{d.diasNomina} días liquidados · {horasDec(d.horas?.trabajadas)} trabajadas · {horasDec(d.horas?.extras)} extra</div><div className="chico">{d.ausencias} ausencia(s) · {d.tardanzas} tardanza(s)</div></div>
      </div>
      <Liquidacion l={d} />
    </Tarjeta>
  </div>;
}

function Pagos({ yo }) {
  const carga = useCarga(() => api('desprendibles'), []), [sel, setSel] = useState(null);
  if (sel) return <Desprendible n={sel} alVolver={() => setSel(null)} />;
  return <div className="pila">
    <Tarjeta titulo="Periodo en curso (estimado)" accion={<span className="suave chico">{fechaCorta(yo.resumen.periodo.desde)} – {fechaCorta(yo.resumen.periodo.hasta)}</span>}><Liquidacion l={yo.resumen} /></Tarjeta>
    <Tarjeta titulo="Mis desprendibles"><Estado carga={carga} lineas={3}>{(l) => l.length === 0 ? <Vacio icono={FileText} titulo="Aún no hay desprendibles">Aparecen aquí cuando la empresa cierra cada periodo de nómina.</Vacio> :
      <ul className="lista tocable">{l.map((n) => <li key={n.id}><button onClick={() => setSel(n)}><FileText size={22} aria-hidden="true" /><span className="crece"><strong>{fechaCorta(n.desde)} – {fechaCorta(n.hasta)}</strong></span><span className="num"><strong>{pesos(n.neto)}</strong></span></button></li>)}</ul>}</Estado></Tarjeta>
  </div>;
}

/* ---------- Permisos ---------- */
const CATS = { ley: 'Remunerados por ley', calamidad: 'Calamidad doméstica', vacaciones: 'Vacaciones', acuerdo: 'Por acuerdo con la empresa', voluntario: 'Voluntario (no remunerado)' };
export function enlaceWhatsApp(numero, texto) { const n = String(numero || '').replace(/\D/g, ''); return `https://wa.me/${n.length === 10 ? '57' + n : n}?text=${encodeURIComponent(texto)}`; }
export function textoPermiso(p, f) { return `Hola ${f.nombre.split(' ')[0]}, soy ${p.nombre} (C.C. ${p.cedula}). Solicito: ${p.tipoNombre}.\nSalida: ${p.fechaSalida} ${p.horaSalida || ''}\nRegreso: ${p.fechaRegreso} ${p.horaRegreso || ''}\nMotivo: ${p.motivo}\n\nPara firmar o rechazar entra aquí con tu clave de firma:\n${f.enlace}`; }

function Permisos({ yo }) {
  const carga = useCarga(() => api('permisosMios'), []), [nuevo, setNuevo] = useState(false), [cancelar, setCancelar] = useState(null), [c, setC] = useState(false), avisos = useAvisos(), v = yo.vacaciones;
  const hacerCancelar = async () => { setC(true); try { await api('permisoCancelar', { id: cancelar.id }); avisos.ok('Solicitud cancelada.'); setCancelar(null); carga.recargar(true); } catch (e) { avisos.error(e); } finally { setC(false); } };
  return <div className="pila">
    <Tarjeta className="hundida"><div className="fila entre"><div className="dato-grande"><span className="suave chico">Vacaciones disponibles</span><span className="valor">{Math.max(0, Math.round((v.causadas - v.tomadas) * 10) / 10).toLocaleString('es-CO')} días hábiles</span></div>
      <span className="suave chico derecha">{yo.usuario.ingreso ? <>Causadas {v.causadas.toLocaleString('es-CO')}<br />Disfrutadas {v.tomadas}</> : 'Falta tu fecha de ingreso'}</span></div></Tarjeta>
    <Boton icono={Plus} onClick={() => setNuevo(true)}>Solicitar permiso o vacaciones</Boton>
    <Estado carga={carga}>{(l) => l.length === 0 ? <Vacio icono={CalendarDays} titulo="No has pedido permisos">Aquí verás el estado de cada solicitud y quién falta por firmar.</Vacio> :
      <div className="pila">{l.map((p) => <Tarjeta key={p.id}>
        <div className="fila entre" style={{ alignItems: 'flex-start' }}><div><h3>{p.tipoNombre}</h3><p className="suave chico">{fechaCorta(p.fechaSalida)} {p.horaSalida} → {fechaCorta(p.fechaRegreso)} {p.horaRegreso}</p></div><Insignia tono={tonoPermiso[p.estado]}>{nombreEstado[p.estado]}</Insignia></div>
        <p style={{ margin: '8px 0' }}>{p.motivo}</p>{p.obs && <p className="suave chico">{p.obs}</p>}
        {p.firmas.length > 0 && <ul className="lista">{p.firmas.map((f) => <li key={f.id}><div className="crece"><strong>{f.nombre}</strong><div className="suave chico">{f.cargo}{f.obs ? ` · ${f.obs}` : ''}</div></div>
          {f.estado === 'pendiente' && p.estado === 'en_firmas' && f.enlace ? (f.whatsapp ? <a className="btn secundario chico" href={enlaceWhatsApp(f.whatsapp, textoPermiso(p, f))} target="_blank" rel="noreferrer"><MessageCircle size={16} aria-hidden="true" />Enviar por WhatsApp</a> : <Insignia tono="aviso">pendiente (aviso por correo)</Insignia>)
            : <Insignia tono={f.estado === 'aprobado' ? 'ok' : f.estado === 'rechazado' ? 'peligro' : 'aviso'}>{f.estado}</Insignia>}</li>)}</ul>}
        {['en_firmas', 'firmado', 'vencido'].includes(p.estado) && <div className="fila fin" style={{ marginTop: 8 }}><Boton variante="texto" chico onClick={() => setCancelar(p)}>Cancelar solicitud</Boton></div>}
      </Tarjeta>)}</div>}</Estado>
    <NuevoPermiso abierta={nuevo} yo={yo} alCerrar={() => setNuevo(false)} alCrear={() => { setNuevo(false); carga.recargar(true); }} />
    <Confirmar abierta={!!cancelar} titulo="Cancelar la solicitud" texto="Sí, cancelar" variante="peligro" cargando={c} alCerrar={() => setCancelar(null)} alConfirmar={hacerCancelar}>Los jefes ya no podrán firmarla. Si la necesitas, tendrás que crear una nueva.</Confirmar>
  </div>;
}

function NuevoPermiso({ abierta, yo, alCerrar, alCrear }) {
  const [f, campo, setF] = useForm({ tipo: '', fechaSalida: hoyISO(), horaSalida: '', fechaRegreso: hoyISO(), horaRegreso: '', motivo: '' }), [soporte, setSoporte] = useState(''), [env, setEnv] = useState(false), [err, setErr] = useState(''), avisos = useAvisos();
  useEffect(() => { if (abierta) { setF({ tipo: '', fechaSalida: hoyISO(), horaSalida: '', fechaRegreso: hoyISO(), horaRegreso: '', motivo: '' }); setSoporte(''); setErr(''); } }, [abierta]); // eslint-disable-line
  const cat = yo.permisosCat.find((p) => p.id === f.tipo), mismo = f.fechaSalida === f.fechaRegreso;
  const enviar = async () => {
    if (!cat) return setErr('Elige el tipo de permiso.'); if (f.fechaRegreso < f.fechaSalida) return setErr('El regreso no puede ser antes de la salida.');
    if (mismo && (!f.horaSalida || !f.horaRegreso)) return setErr('Para un permiso dentro del mismo día indica la hora de salida y la de regreso.'); if (f.motivo.trim().length < 5) return setErr('Escribe el motivo.');
    setEnv(true); setErr('');
    try { const p = await api('permisoCrear', { ...f, soporte }); avisos.ok(p.firmas.length ? 'Solicitud creada. Envíala a tus jefes por WhatsApp para que la firmen.' : 'Solicitud creada. Queda a la espera del administrador.', 8000); alCrear(); }
    catch (e) { setErr(e.message); } finally { setEnv(false); }
  };
  return <Hoja abierta={abierta} alCerrar={alCerrar} titulo="Solicitar permiso">
    <Campo como="select" etiqueta="Tipo de permiso" {...campo('tipo')}><option value="">Elige…</option>{Object.keys(CATS).map((k) => <optgroup key={k} label={CATS[k]}>{yo.permisosCat.filter((p) => p.cat === k).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</optgroup>)}</Campo>
    {cat && <Aviso tono={cat.rem ? 'ok' : 'aviso'}><strong>{cat.rem ? 'Remunerado' : 'No remunerado'}.</strong> Fundamento: {cat.norma}.{cat.cat === 'calamidad' && ' Puedes pedirlo aunque ya haya ocurrido; adjunta el soporte cuando lo tengas.'}</Aviso>}
    <div className="rejilla"><Campo etiqueta="Fecha de salida" type="date" {...campo('fechaSalida')} /><Campo etiqueta="Hora de salida" type="time" {...campo('horaSalida')} /></div>
    <div className="rejilla"><Campo etiqueta="Fecha de regreso" type="date" min={f.fechaSalida} ayuda="Día en que vuelves al trabajo." {...campo('fechaRegreso')} /><Campo etiqueta="Hora de regreso" type="time" {...campo('horaRegreso')} /></div>
    <Campo como="textarea" etiqueta="Motivo" maxLength={500} {...campo('motivo')} />
    <div className="campo"><label htmlFor="sop">Soporte (opcional)</label><input id="sop" className="entrada" style={{ paddingTop: 10 }} type="file" accept="image/*" onChange={async (e) => { const a = e.target.files[0]; if (!a) return setSoporte(''); try { setSoporte(await comprimirArchivo(a)); } catch (x) { avisos.error(x); } }} /><span className="ayuda">Foto de la cita, citación o constancia. Se comprime antes de enviarse.</span></div>
    {err && <Aviso tono="peligro">{err}</Aviso>}
    <p className="suave chico">Debe ser firmado por todos tus jefes. Tienen {yo.cfg.horasLimitePermiso} horas para responder.</p>
    <div className="acciones-hoja"><Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton><Boton cargando={env} onClick={enviar}>Crear solicitud</Boton></div>
  </Hoja>;
}

/* ---------- Perfil ---------- */
let instalador = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); instalador = e; });
function Perfil({ yo, recargar, alSalir }) {
  const u = yo.usuario, avisos = useAvisos(), [f, campo] = useForm({ email: u.email, telefono: u.telefono, salario: u.salario }), [cl, cCampo, setCl] = useForm({ actual: '', nueva: '' });
  const [g, setG] = useState(false), [gc, setGc] = useState(false), [notif, setNotif] = useState(notificacionesActivas()), [salir, setSalir] = useState(false);
  const instalada = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone, ios = /iphone|ipad/i.test(navigator.userAgent);
  const guardar = async () => { setG(true); try { await api('misDatos', { email: f.email, telefono: f.telefono, ...(u.salarioOk ? {} : { salario: +String(f.salario).replace(/\D/g, '') }) }); avisos.ok('Datos guardados.'); recargar(); } catch (e) { avisos.error(e); } finally { setG(false); } };
  const clave = async () => { setGc(true); try { await api('cambiarClave', cl); avisos.ok('Contraseña cambiada.'); setCl({ actual: '', nueva: '' }); } catch (e) { avisos.error(e); } finally { setGc(false); } };
  const centro = yo.centros.find((c) => c.id === u.centroId);
  return <div className="pila">
    <Tarjeta><h2>{u.nombre}</h2><p className="suave">C.C. {u.cedula}{u.cargo ? ` · ${u.cargo}` : ''}</p><p className="suave chico">{centro ? centro.nombre : 'Sin centro de trabajo asignado'}{u.ingreso ? ` · ingreso ${fechaCorta(u.ingreso)}` : ''}</p></Tarjeta>
    <Tarjeta titulo="Mis datos"><div className="pila">
      <Campo etiqueta="Correo" type="email" autoComplete="email" {...campo('email')} /><Campo etiqueta="Celular" type="tel" inputMode="numeric" autoComplete="tel" {...campo('telefono')} />
      <Campo etiqueta="Salario mensual" inputMode="numeric" disabled={u.salarioOk} ayuda={u.salarioOk ? 'Validado por el administrador. Para cambiarlo, habla con él.' : 'Pendiente de validación por el administrador.'} {...campo('salario')} />
      <Boton cargando={g} onClick={guardar}>Guardar datos</Boton></div></Tarjeta>
    <Tarjeta titulo="Recordatorios e instalación"><div className="pila">
      <p className="suave chico">Te avisa {yo.cfg.recordatorioMin} minutos antes de iniciar la jornada y {yo.cfg.recordatorioMin} minutos después de la hora de salida; lo mismo con el almuerzo. Con la aplicación cerrada, el aviso llega por correo si la empresa lo tiene activo.</p>
      {notif ? <Aviso tono="ok">Los recordatorios están activos en este celular.</Aviso> : <Boton variante="secundario" icono={Bell} onClick={async () => { const r = await pedirNotificaciones(); setNotif(r === 'granted'); if (r === 'granted') { programarRecordatorios(yo.hoy, yo.cfg.recordatorioMin); avisos.ok('Recordatorios activados.'); } else avisos.error(r === 'denied' ? 'Las notificaciones están bloqueadas en los ajustes del navegador.' : 'Este navegador no permite notificaciones.'); }}>Activar recordatorios</Boton>}
      {instalada ? <Aviso tono="ok">La aplicación está instalada en este dispositivo.</Aviso> : instalador ? <Boton variante="secundario" icono={Download} onClick={async () => { instalador.prompt(); await instalador.userChoice; instalador = null; }}>Instalar en este celular</Boton>
        : <p className="suave chico">{ios ? 'Para instalarla en iPhone: botón Compartir de Safari → «Agregar a inicio».' : 'Para instalarla: menú del navegador (⋮) → «Instalar aplicación» o «Agregar a pantalla principal».'}</p>}
    </div></Tarjeta>
    <Tarjeta titulo="Cambiar contraseña"><div className="pila"><Campo etiqueta="Contraseña actual" type="password" autoComplete="current-password" {...cCampo('actual')} /><Campo etiqueta="Contraseña nueva" type="password" autoComplete="new-password" ayuda="Mínimo 6 caracteres." {...cCampo('nueva')} /><Boton variante="secundario" icono={KeyRound} cargando={gc} disabled={!cl.actual || cl.nueva.length < 6} onClick={clave}>Cambiar contraseña</Boton></div></Tarjeta>
    <Boton variante="secundario" icono={LogOut} onClick={() => setSalir(true)}>Cerrar sesión</Boton>
    <PieLegal />
    <Confirmar abierta={salir} titulo="Cerrar sesión" texto="Cerrar sesión" alCerrar={() => setSalir(false)} alConfirmar={alSalir}>Tendrás que ingresar de nuevo con tu cédula y contraseña.{bandeja.lista().length > 0 && <strong> Tienes marcaciones sin enviar que se perderán.</strong>}</Confirmar>
  </div>;
}


  // [NUEVO] Obtener geolocalización
  const obtenerUbicacion = () => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(`${pos.coords.latitude},${pos.coords.longitude}`),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 5000 }
      );
    });
  };

export default function Trabajador({ yo, actualizar, recargar, alSalir }) {
  const [tab, setTab] = useState('inicio');
  const tabs = [['inicio', 'Jornada', Clock], ['permisos', 'Permisos', CalendarDays], ['pagos', 'Pagos', Wallet], ['perfil', 'Perfil', UserRound]];
  return <>
    <main className="contenido" id="contenido" tabIndex={-1}>
      <h1 className="oculto-visual">{tabs.find((t) => t[0] === tab)[1]}</h1>
      {tab === 'inicio' && <Inicio yo={yo} actualizar={actualizar} recargar={recargar} />}
      {tab === 'permisos' && <Permisos yo={yo} />}
      {tab === 'pagos' && <Pagos yo={yo} />}
      {tab === 'perfil' && <Perfil yo={yo} recargar={recargar} alSalir={alSalir} />}
    </main>
    <nav className="nav-inferior no-imprimir" aria-label="Secciones"><ul>{tabs.map(([k, t, I]) => <li key={k}><button aria-current={tab === k ? 'page' : undefined} onClick={() => { setTab(k); window.scrollTo(0, 0); }}><I size={22} aria-hidden="true" />{t}</button></li>)}</ul></nav>
  </>;
}
