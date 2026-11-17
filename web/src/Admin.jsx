import React, { useEffect, useMemo, useState } from 'react';
import { AlarmClock, BellRing, Building2, CalendarCheck, ClipboardList, Download, FileSpreadsheet, HeartPulse, Image, LayoutDashboard, LogOut, MapPin, Pencil, Plus, RefreshCw, Settings, Stethoscope, Timer, Upload, Users, Wallet, KeyRound, LocateFixed, CalendarClock, BarChart3, Copy, MessageCircle } from 'lucide-react';
import { api, conexion } from './api.js';
import { Aviso, Boton, Campo, Casilla, Confirmar, Estado, Hoja, Insignia, Tabla, Tarjeta, Vacio, useAvisos, useCarga, useForm } from './ui.jsx';
import { NOMBRE_TIPO, TIPOS, fechaCorta, fechaHora, horas, hoyISO, pesos, sumarDias, ubicar } from './util.js';
import Informes from './Informes.jsx';
import { Permisos, Extras, Incapacidades, Nomina, Obras, Alertas, Config, Sistema, Turnos } from './Admin2.jsx';

export const periodoActual = (tipo) => { const h = hoyISO(), ym = h.slice(0, 8), d = +h.slice(8), fin = new Date(+h.slice(0, 4), +h.slice(5, 7), 0).getDate();
  return tipo === 'mensual' ? { desde: ym + '01', hasta: ym + fin } : d <= 15 ? { desde: ym + '01', hasta: ym + '15' } : { desde: ym + '16', hasta: ym + fin }; };
export function Rango({ r, setR }) {
  return <div className="fila"><Campo etiqueta="Desde" type="date" value={r.desde} onChange={(e) => setR({ ...r, desde: e.target.value })} /><Campo etiqueta="Hasta" type="date" value={r.hasta} min={r.desde} onChange={(e) => setR({ ...r, hasta: e.target.value })} /></div>;
}
export async function aExcel(hojas, nombre) {
  const XLSX = await import('xlsx'), libro = XLSX.utils.book_new();
  Object.keys(hojas).forEach((h) => { const filas = hojas[h]; if (!Array.isArray(filas)) return; const ws = XLSX.utils.json_to_sheet(filas.length ? filas : [{ 'Sin registros': '' }]);
    ws['!cols'] = Object.keys(filas[0] || { a: 1 }).map((k) => ({ wch: Math.min(40, Math.max(k.length + 2, ...filas.slice(0, 200).map((f) => String(f[k] ?? '').length + 2))) })); XLSX.utils.book_append_sheet(libro, ws, h.slice(0, 31)); });
  XLSX.writeFile(libro, nombre);
}
export function useAccion() {
  const avisos = useAvisos(), [ocupado, setO] = useState(false);
  const correr = async (fn, ok) => { setO(true); try { const r = await fn(); if (ok) avisos.ok(ok); return r === undefined ? true : r; } catch (e) { avisos.error(e); return false; } finally { setO(false); } };
  return [correr, ocupado];
}
export const Titulo = ({ t, children, accion }) => <div className="titulo-pagina"><div><h1>{t}</h1>{children && <p>{children}</p>}</div>{accion && <div className="fila no-imprimir">{accion}</div>}</div>;

/* ---------- Tablero ---------- */
const EST = { presente: ['Trabajando', 'ok'], almuerzo: ['En almuerzo', 'info'], salio: ['Ya salió', ''], ausente: ['No se presentó', 'peligro'], por_llegar: ['Por llegar', ''], permiso: ['En permiso', 'info'], incapacidad: ['Incapacidad', 'info'], descanso: ['Descanso', ''] };
function Tablero({ ir }) {
  const carga = useCarga(() => api('adminTablero'), []), [filtro, setFiltro] = useState('');
  useEffect(() => { const i = setInterval(() => { if (document.visibilityState === 'visible') carga.recargar(true); }, 120000); return () => clearInterval(i); }, []); // eslint-disable-line
  return <><Titulo t="Hoy en la empresa" accion={<Boton variante="secundario" icono={RefreshCw} cargando={carga.cargando} onClick={() => carga.recargar()}>Actualizar</Boton>}>Quién está, quién falta y qué espera tu decisión.</Titulo>
    <Estado carga={carga} lineas={8}>{(d) => { const c = d.cuenta, p = d.pendientes, pend = [['permisos', p.permisos, 'permiso(s) por aprobar', 'permisos'], ['extras', p.extras, 'registro(s) de horas extra por aprobar', 'extras'], ['revisar', p.revisar, 'marcación(es) digitadas o tardías por revisar', 'marcaciones'], ['usuarios', p.usuarios, 'usuario(s) nuevos por aprobar', 'personal'], ['salarios', p.salarios, 'salario(s) sin validar', 'personal']].filter((x) => x[1] > 0);
      return <div className="pila amplia">
        <p className="suave">{new Date(d.fecha + 'T12:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })} · {d.hora}{d.festivo ? ' · festivo' : ''}</p>
        {d.pasos && !Object.values(d.pasos).every(Boolean) && <Tarjeta titulo="Primeros pasos" accion={<span className="suave chico">{Object.values(d.pasos).filter(Boolean).length} de 6</span>}>
          <p className="suave chico" style={{ marginBottom: 8 }}>Completa esto una vez y la aplicación queda lista para tu personal.</p>
          <ol className="lista tocable" style={{ paddingLeft: 0 }}>{[['empresa', 'Pon el nombre, NIT y logo de la empresa', 'config'], ['centros', 'Crea las obras o sedes con su horario y ubicación', 'centros'], ['alertas', 'Escribe el correo que recibe las alertas', 'alertas'],
            ['jefes', 'Agrega los jefes que firman los permisos', 'config'], ['personal', 'Carga el personal (uno a uno o desde Excel)', 'personal'], ['activos', 'Comparte el enlace: al menos una persona activó su cuenta', 'personal']].map(([k, t, v], i) =>
            <li key={k}><button onClick={() => ir(v)}><span className="insignia" style={d.pasos[k] ? { background: 'var(--c-ok-suave)', color: 'var(--c-ok)' } : undefined} aria-hidden="true">{d.pasos[k] ? '✓' : i + 1}</span><span className="crece" style={d.pasos[k] ? { textDecoration: 'line-through', color: 'var(--c-texto-2)' } : undefined}>{t}<span className="oculto-visual">{d.pasos[k] ? ' (hecho)' : ' (pendiente)'}</span></span>{!d.pasos[k] && <span className="suave chico">Ir</span>}</button></li>)}</ol>
        </Tarjeta>}
        <div className="indicadores" role="group" aria-label="Filtrar personal por estado">
          {[['presente', c.presente + c.almuerzo, 'Trabajando', 'ok'], ['ausente', c.ausente, 'No se presentaron', 'peligro'], ['tarde', c.tarde, 'Llegaron tarde', 'aviso'], ['por_llegar', c.por_llegar, 'Por llegar', ''], ['salio', c.salio, 'Ya salieron', ''], ['novedad', c.permiso + c.incapacidad, 'Permiso o incapacidad', 'info']].map(([k, v, t, tono]) =>
            <button key={k} className={`indicador n-${tono}`} aria-pressed={filtro === k} onClick={() => setFiltro(filtro === k ? '' : k)} style={filtro === k ? { background: 'var(--c-primario-suave)' } : undefined}><span className="valor">{v}</span><span className="rotulo">{t}</span></button>)}
        </div>
        {pend.length > 0 && <Tarjeta titulo="Esperan tu decisión"><ul className="lista tocable">{pend.map(([k, n, t, destino]) => <li key={k}><button onClick={() => ir(destino)}><Insignia tono="peligro">{n}</Insignia><span className="crece">{t}</span><span className="suave chico">Revisar</span></button></li>)}</ul></Tarjeta>}
        {p.enFirmas > 0 && <p className="suave chico">{p.enFirmas} permiso(s) están en manos de los jefes para firma.</p>}
        <Tabla columnas={[{ k: 'nombre', t: 'Persona', render: (f) => <><strong>{f.nombre}</strong><div className="suave chico">{f.cargo}</div></> }, { k: 'centro', t: 'Centro de trabajo' },
          { k: 'estado', t: 'Estado', render: (f) => <span className="fila" style={{ gap: 4 }}><Insignia tono={EST[f.estado][1]}>{EST[f.estado][0]}</Insignia>{f.tarde > 0 && <Insignia tono="aviso">tarde {f.tarde} min</Insignia>}{f.fueraZona && <Insignia tono="peligro">fuera de zona</Insignia>}</span>, texto: (f) => EST[f.estado][0] },
          { k: 'entrada', t: 'Entrada', num: true }, { k: 'salida', t: 'Salida', num: true }]}
          filas={d.personas.filter((f) => !filtro || (filtro === 'tarde' ? f.tarde > 0 : filtro === 'presente' ? ['presente', 'almuerzo'].includes(f.estado) : filtro === 'novedad' ? ['permiso', 'incapacidad'].includes(f.estado) : f.estado === filtro))}
          clave={(f) => f.cedula} vacio="Aún no hay personal activo. Ve a «Personal» para cargarlo." />
      </div>; }}</Estado></>;
}

/* ---------- Personal ---------- */
const ESTADO_U = { activo: ['Activo', 'ok'], pendiente: ['Por aprobar', 'aviso'], preregistrado: ['Sin activar', 'info'], inactivo: ['Inactivo', ''] };
function Personal({ centros }) {
  const carga = useCarga(() => api('adminPersonal'), []), [edit, setEdit] = useState(null), [codigo, setCodigo] = useState(null), [imp, setImp] = useState(null), [correr, ocupado] = useAccion();
  const nombreCentro = (id) => centros.find((c) => c.id === id)?.nombre || '—';
  const importar = async (e) => {
    const a = e.target.files[0]; e.target.value = ''; if (!a) return;
    const XLSX = await import('xlsx'), wb = XLSX.read(await a.arrayBuffer()), filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    const n = (o, ...ks) => { for (const k of Object.keys(o)) if (ks.some((x) => k.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(x))) return o[k]; return ''; };
    const l = filas.map((o) => ({ cedula: String(n(o, 'cedula', 'documento')), nombre: String(n(o, 'nombre')), cargo: String(n(o, 'cargo')), salario: +String(n(o, 'salario')).replace(/\D/g, '') || 0, email: String(n(o, 'correo', 'email')), telefono: String(n(o, 'telefono', 'celular')), ingreso: String(n(o, 'ingreso')).slice(0, 10), eps: String(n(o, 'eps')), arl: String(n(o, 'arl')),
      centroId: centros.find((c) => c.nombre.toLowerCase() === String(n(o, 'centro', 'obra')).toLowerCase())?.id || '' })).filter((x) => x.cedula && x.nombre);
    if (!l.length) return setImp({ error: 'El archivo no tiene filas con las columnas «Cédula» y «Nombre».' });
    const r = await correr(() => api('adminPersonaImportar', { filas: l }, { espera: 120000 })); if (r) { setImp({ res: r }); carga.recargar(true); }
  };
  return <><Titulo t="Personal" accion={<><label className="btn secundario"><Upload size={20} aria-hidden="true" />Importar Excel<input type="file" accept=".xlsx,.xls,.csv" className="oculto-visual" onChange={importar} /></label><Boton icono={Plus} onClick={() => setEdit({})}>Agregar persona</Boton></>}>Cada persona activa su cuenta con su cédula y un código de un solo uso que entregas tú.</Titulo>
    <Tarjeta className="hundida" style={{ marginBottom: 16 }}><div className="fila entre"><div className="crece" style={{ minWidth: 220 }}><strong>Enlace para tu personal</strong><div className="suave chico" style={{ wordBreak: 'break-all' }}>{conexion.enlace()}</div><div className="suave chico">Cada persona lo abre en su celular, entra con su cédula y su código de activación, y luego instala la aplicación.</div></div>
      <div className="fila"><Boton chico variante="secundario" icono={Copy} onClick={() => navigator.clipboard?.writeText(conexion.enlace())}>Copiar</Boton><a className="btn secundario chico" href={`https://wa.me/?text=${encodeURIComponent('Control de jornada. Abre este enlace en tu celular para registrar tu entrada y salida: ' + conexion.enlace())}`} target="_blank" rel="noreferrer"><MessageCircle size={16} aria-hidden="true" />WhatsApp</a></div></div></Tarjeta>
    <Estado carga={carga} lineas={8}>{(l) => <Tabla columnas={[
      { k: 'nombre', t: 'Nombre', render: (u) => <><strong>{u.nombre}</strong><div className="suave chico">C.C. {u.cedula}{u.rol === 'admin' ? ' · administrador' : u.rol === 'supervisor' ? ' · supervisor' : ''}</div></>, texto: (u) => u.nombre + ' ' + u.cedula },
      { k: 'cargo', t: 'Cargo' }, { k: 'centroId', t: 'Centro', render: (u) => nombreCentro(u.centroId), texto: (u) => nombreCentro(u.centroId) },
      { k: 'salario', t: 'Salario', num: true, render: (u) => <>{pesos(u.salario)}{!u.salarioOk && u.salario > 0 && <div><Insignia tono="aviso">sin validar</Insignia></div>}</> },
      { k: 'estado', t: 'Estado', render: (u) => <Insignia tono={ESTADO_U[u.estado]?.[1]}>{ESTADO_U[u.estado]?.[0] || u.estado}</Insignia>, texto: (u) => ESTADO_U[u.estado]?.[0] },
      { k: 'a', t: '', acciones: true, orden: false, render: (u) => <Boton chico variante="secundario" icono={Pencil} onClick={() => setEdit(u)}>Editar</Boton> }]}
      filas={l} clave={(u) => u.cedula} vacio="Agrega la primera persona o importa la lista desde Excel." />}</Estado>
    <FormPersona persona={edit} centros={centros} alCerrar={() => setEdit(null)} alGuardar={(r) => { setEdit(null); carga.recargar(true); if (r.codigo) setCodigo(r); }} />
    <Hoja abierta={!!codigo} alCerrar={() => setCodigo(null)} titulo="Código de activación" alto={0.55}>{codigo && <>
      <p>Entrega este código a <strong>{codigo.usuario?.nombre || 'la persona'}</strong>. Lo usa una sola vez, junto con su cédula, para crear su contraseña.</p>
      <div className="reloj" style={{ justifyContent: 'center', letterSpacing: '.12em', fontSize: '3.5rem' }} aria-label={`Código ${codigo.codigo.split('').join(' ')}`}>{codigo.codigo}</div>
      <Aviso tono="aviso">Anótalo ahora: por seguridad no se vuelve a mostrar. Si se pierde, genera uno nuevo desde «Editar».</Aviso>
      <div className="acciones-hoja"><Boton variante="secundario" onClick={() => navigator.clipboard?.writeText(codigo.codigo)}>Copiar</Boton><Boton onClick={() => setCodigo(null)}>Listo</Boton></div></>}</Hoja>
    <Hoja abierta={!!imp} alCerrar={() => setImp(null)} titulo="Resultado de la importación">{imp?.error ? <Aviso tono="peligro">{imp.error}</Aviso> : imp && <>
      <Aviso tono="aviso">Descarga los códigos ahora: no se vuelven a mostrar.</Aviso>
      <Boton icono={Download} onClick={() => aExcel({ 'Códigos': imp.res.map((r) => ({ 'Cédula': r.cedula, Nombre: r.nombre, Resultado: r.resultado, 'Código de activación': r.codigo })) }, 'codigos-activacion.xlsx')}>Descargar códigos en Excel</Boton>
      <ul className="lista">{imp.res.map((r, i) => <li key={i}><span className="crece">{r.nombre}<div className="suave chico">{r.resultado}</div></span><strong className="num">{r.codigo}</strong></li>)}</ul></>}</Hoja>
    {ocupado && <div className="avisos-flotantes"><div className="flotante" role="status"><span className="giro" />Importando…</div></div>}
  </>;
}
function FormPersona({ persona, centros, alCerrar, alGuardar }) {
  const nueva = persona && !persona.cedula, [f, campo, setF] = useForm({}), [correr, ocupado] = useAccion();
  useEffect(() => { if (persona) setF({ cedula: '', nombre: '', cargo: '', rol: 'trabajador', centroId: centros[0]?.id || '', salario: '', tipoPago: 'mensual', email: '', telefono: '', ingreso: '', eps: '', arl: '', supCentros: [], banco: '', tipoCuenta: '', cuenta: '', retiro: '', ...persona }); }, [persona]); // eslint-disable-line
  const guardar = async (extra) => { const r = await correr(() => api('adminPersonaGuardar', { ...f, salario: +String(f.salario).replace(/\D/g, ''), ...extra }), 'Persona guardada.'); if (r) alGuardar(r); };
  const nuevoCodigo = async () => { const r = await correr(() => api('adminPersonaCodigo', { cedula: f.cedula })); if (r) alGuardar({ codigo: r.codigo, usuario: f }); };
  return <Hoja abierta={!!persona} alCerrar={alCerrar} titulo={nueva ? 'Agregar persona' : 'Editar persona'}>
    {persona?.estado === 'pendiente' && <Aviso tono="aviso">Se registró con el código de la empresa. Revisa sus datos y salario, y apruébala para que pueda marcar.</Aviso>}
    <div className="rejilla"><Campo etiqueta="Cédula" inputMode="numeric" disabled={!nueva} required {...campo('cedula')} /><Campo etiqueta="Nombre completo" required {...campo('nombre')} /></div>
    <div className="rejilla"><Campo etiqueta="Cargo" {...campo('cargo')} /><Campo como="select" etiqueta="Centro de trabajo" {...campo('centroId')}><option value="">Sin asignar</option>{centros.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Campo></div>
    <div className="rejilla"><Campo etiqueta="Salario" inputMode="numeric" ayuda="Al guardar queda validado." {...campo('salario')} /><Campo como="select" etiqueta="Forma de pago" opciones={[{ v: 'mensual', t: 'Salario mensual' }, { v: 'dia', t: 'Valor por día trabajado' }]} {...campo('tipoPago')} /></div>
    <div className="rejilla"><Campo etiqueta="Fecha de ingreso" type="date" ayuda="Para calcular vacaciones." {...campo('ingreso')} /><Campo como="select" etiqueta="Rol" opciones={[{ v: 'trabajador', t: 'Trabajador' }, { v: 'supervisor', t: 'Supervisor de obra' }, { v: 'admin', t: 'Administrador' }]} {...campo('rol')} /></div>
    {f.rol === 'supervisor' && <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="pila junta"><legend className="etiqueta">Centros que supervisa</legend><span className="ayuda">Ve el tablero, las marcaciones y los permisos de esa gente, y aprueba sus horas extra. No ve salarios ni nómina. Sin marcar ninguno, supervisa su propio centro.</span>{centros.map((c) => <Casilla key={c.id} checked={(f.supCentros || []).includes(c.id)} onChange={(e) => setF((x) => ({ ...x, supCentros: e.target.checked ? [...(x.supCentros || []), c.id] : (x.supCentros || []).filter((y) => y !== c.id) }))}>{c.nombre}</Casilla>)}</fieldset>}
    <div className="rejilla"><Campo etiqueta="Correo" type="email" {...campo('email')} /><Campo etiqueta="Celular" inputMode="numeric" {...campo('telefono')} /></div>
    <div className="rejilla"><Campo etiqueta="EPS" {...campo('eps')} /><Campo etiqueta="ARL" {...campo('arl')} /></div>
    <div className="rejilla"><Campo etiqueta="Banco" ayuda="Para el archivo plano de pagos." {...campo('banco')} /><Campo como="select" etiqueta="Tipo de cuenta" opciones={[{ v: '', t: '—' }, { v: 'ahorros', t: 'Ahorros' }, { v: 'corriente', t: 'Corriente' }]} {...campo('tipoCuenta')} /><Campo etiqueta="Número de cuenta" inputMode="numeric" {...campo('cuenta')} /></div>
    {!nueva && persona?.estado !== 'pendiente' && <Campo etiqueta="Fecha de retiro" type="date" ayuda="Solo al dar de baja: desde el día siguiente deja de liquidarse. Vacía = hoy." {...campo('retiro')} />}
    {!nueva && <div className="fila"><Boton chico variante="secundario" icono={KeyRound} onClick={nuevoCodigo}>Nuevo código (restablece la contraseña)</Boton>
      {persona?.estado === 'activo' && <Boton chico variante="texto" onClick={() => guardar({ estado: 'inactivo' })}>Dar de baja{f.retiro ? ` el ${fechaCorta(f.retiro)}` : ' hoy'}</Boton>}{persona?.estado === 'inactivo' && <Boton chico variante="texto" onClick={() => guardar({ estado: 'activo' })}>Reactivar</Boton>}</div>}
    <div className="acciones-hoja"><Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton><Boton cargando={ocupado} onClick={() => guardar(persona?.estado === 'pendiente' ? { estado: 'activo' } : {})}>{persona?.estado === 'pendiente' ? 'Guardar y aprobar' : 'Guardar'}</Boton></div>
  </Hoja>;
}

/* ---------- Centros de trabajo ---------- */
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'], ORDEN = [1, 2, 3, 4, 5, 6, 0];
const minDia = (h) => { if (!h?.e || !h?.s) return 0; const m = (x) => +x.slice(0, 2) * 60 + +x.slice(3); let t = m(h.s) - m(h.e); if (t <= 0) t += 1440; if (h.ai && h.af) t -= Math.max(0, m(h.af) - m(h.ai)); return t; };
function Centros({ centros, recargar }) {
  const [edit, setEdit] = useState(null);
  return <><Titulo t="Centros de trabajo" accion={<Boton icono={Plus} onClick={() => setEdit({})}>Agregar centro</Boton>}>Cada obra o sede tiene su horario, su ubicación y su radio permitido para marcar.</Titulo>
    {centros.length === 0 ? <Vacio icono={Building2} titulo="Aún no hay centros de trabajo">Crea el primero para asignarle personal y horario.</Vacio> :
      <div className="rejilla dos">{centros.map((c) => { const sem = ORDEN.reduce((s, d) => s + minDia(c.horario[d]), 0); return <Tarjeta key={c.id}>
        <div className="fila entre" style={{ alignItems: 'flex-start' }}><div><h3>{c.nombre}</h3><p className="suave chico">{c.cliente}{c.direccion ? ` · ${c.direccion}` : ''}</p></div>{!c.activo && <Insignia>Inactivo</Insignia>}</div>
        <ul className="lista chico" style={{ margin: '12px 0' }}>{ORDEN.filter((d) => c.horario[d]).map((d) => <li key={d} style={{ padding: '4px 0' }}><span className="crece">{DIAS[d]}</span><span className="num">{c.horario[d].e}–{c.horario[d].s}{c.horario[d].ai ? ` · almuerzo ${c.horario[d].ai}–${c.horario[d].af}` : ''}</span></li>)}</ul>
        <div className="fila"><Insignia tono={sem > 42 * 60 ? 'peligro' : 'ok'}>{horas(sem)} por semana</Insignia><Insignia tono={c.lat === null ? 'aviso' : ''}><MapPin size={12} aria-hidden="true" />{c.lat === null ? 'sin ubicación' : `radio ${c.radio} m`}</Insignia><span className="crece" /><Boton chico variante="secundario" icono={Pencil} onClick={() => setEdit(c)}>Editar</Boton></div>
      </Tarjeta>; })}</div>}
    <FormCentro centro={edit} alCerrar={() => setEdit(null)} alGuardar={() => { setEdit(null); recargar(); }} /></>;
}
function FormCentro({ centro, alCerrar, alGuardar }) {
  const [f, campo, setF] = useForm({}), [hor, setHor] = useState({}), [correr, ocupado] = useAccion(), avisos = useAvisos(), [gps, setGps] = useState(false);
  useEffect(() => { if (!centro) return; setF({ nombre: '', cliente: '', direccion: '', radio: 150, tol: 5, festivos: false, activo: true, ...centro, lat: centro.lat ?? '', lng: centro.lng ?? '' });
    setHor(centro.id ? centro.horario : Object.fromEntries([1, 2, 3, 4, 5].map((d) => [d, { e: '07:00', s: '16:24', ai: '12:00', af: '13:00' }]))); }, [centro]); // eslint-disable-line
  const pon = (d, k, v) => setHor((h) => ({ ...h, [d]: { ...(h[d] || {}), [k]: v } }));
  const sem = ORDEN.reduce((s, d) => s + minDia(hor[d]), 0);
  const aqui = async () => { setGps(true); try { const p = await ubicar(); setF((x) => ({ ...x, lat: p.lat.toFixed(6), lng: p.lng.toFixed(6) })); avisos.ok(`Ubicación tomada (precisión ${p.prec} m).`); } catch (e) { avisos.error(e); } finally { setGps(false); } };
  const guardar = async () => { const r = await correr(() => api('adminCentroGuardar', { ...f, horario: hor }), 'Centro guardado.'); if (r) alGuardar(); };
  return <Hoja abierta={!!centro} alCerrar={alCerrar} titulo={centro?.id ? 'Editar centro de trabajo' : 'Nuevo centro de trabajo'} alto={0.92}>
    <div className="rejilla"><Campo etiqueta="Nombre de la obra o sede" required {...campo('nombre')} /><Campo etiqueta="Cliente" {...campo('cliente')} /></div>
    <Campo etiqueta="Dirección" {...campo('direccion')} />
    <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="pila junta"><legend className="etiqueta" style={{ marginBottom: 8 }}>Horario por día</legend>
      <div className="dias-horario">{ORDEN.map((d) => { const h = hor[d] || {}; return <div className="dia" key={d}><span className="etiqueta">{DIAS[d]}</span>
        {[['e', 'entrada'], ['ai', 'inicio de almuerzo'], ['af', 'fin de almuerzo'], ['s', 'salida']].map(([k, n]) => <input key={k} type="time" className="entrada" aria-label={`${DIAS[d]}: ${n}`} title={n} value={h[k] || ''} onChange={(e) => pon(d, k, e.target.value)} />)}</div>; })}</div>
      <span className="ayuda">Orden: entrada · inicio de almuerzo · fin de almuerzo · salida. Deja vacío el día que no se trabaja. Un cambio de horario aplica desde hoy; los días ya trabajados conservan el horario con que se ficharon.</span>
      {sem > 0 && <Aviso tono={sem > 42 * 60 ? 'peligro' : 'ok'}>Este horario suma <strong>{horas(sem)}</strong> a la semana. {sem > 42 * 60 ? 'Supera la jornada máxima legal de 42 horas (Ley 2101 de 2021): el exceso se liquidará como horas extra.' : 'Está dentro de la jornada máxima legal de 42 horas.'}</Aviso>}
    </fieldset>
    <div className="rejilla"><Campo etiqueta="Tolerancia de llegada (min)" type="number" min="0" {...campo('tol')} /><Campo etiqueta="Radio permitido (m)" type="number" min="20" {...campo('radio')} /></div>
    <div className="rejilla"><Campo etiqueta="Latitud" inputMode="decimal" {...campo('lat')} /><Campo etiqueta="Longitud" inputMode="decimal" {...campo('lng')} /></div>
    <Boton variante="secundario" icono={LocateFixed} cargando={gps} onClick={aqui}>Usar mi ubicación actual (estoy en la obra)</Boton>
    <Casilla {...campo('festivos', 'check')}>En este centro se trabaja los festivos según el horario</Casilla>
    <Casilla {...campo('activo', 'check')}>Centro activo</Casilla>
    <div className="acciones-hoja"><Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton><Boton cargando={ocupado} onClick={guardar}>Guardar centro</Boton></div>
  </Hoja>;
}

/* ---------- Marcaciones ---------- */
function Marcaciones({ centros, soloVer }) {
  const [r, setR] = useState({ desde: sumarDias(hoyISO(), -6), hasta: hoyISO() }), [centroId, setCentroId] = useState(''), carga = useCarga(() => api('adminMarcaciones', { ...r, centroId }), [r.desde, r.hasta, centroId]);
  const [det, setDet] = useState(null), [foto, setFoto] = useState(null), [aj, setAj] = useState(null), [correr, ocupado] = useAccion();
  const verFoto = async (id) => { setFoto({ cargando: true }); const x = await correr(() => api('adminFoto', { id })); setFoto(x ? x : null); };
  const guardarAjuste = async () => { const ok = await correr(() => api('adminMarcacionGuardar', aj), aj.anular ? 'Marcación anulada.' : 'Marcación ajustada.'); if (ok) { setAj(null); setDet(null); carga.recargar(true); } };
  const revisada = async (id) => { if (await correr(() => api('adminMarcacionRevisada', { id }), 'Marcada como revisada.')) { setDet(null); carga.recargar(true); } };
  return <><Titulo t="Marcaciones">Jornada por persona y día. Abre un día para ver ubicación, foto y corregir una hora.</Titulo>
    <div className="fila" style={{ marginBottom: 16, alignItems: 'flex-end' }}><Rango r={r} setR={setR} /><Campo como="select" etiqueta="Centro" value={centroId} onChange={(e) => setCentroId(e.target.value)}><option value="">Todos</option>{centros.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Campo></div>
    <Estado carga={carga} lineas={8}>{(l) => <Tabla columnas={[
      { k: 'fecha', t: 'Fecha', render: (f) => <span>{fechaCorta(f.fecha)}</span> }, { k: 'nombre', t: 'Persona', render: (f) => <strong>{f.nombre}</strong> }, { k: 'centro', t: 'Centro' },
      { k: 'entrada', t: 'Entrada', num: true }, { k: 'salAlm', t: 'Almuerzo', num: true, render: (f) => f.salAlm ? `${f.salAlm}–${f.entAlm || '?'}` : f.almuerzoAsumido ? <span className="suave">asumido</span> : '' }, { k: 'salida', t: 'Salida', num: true },
      { k: 'min', t: 'Trabajado', num: true, render: (f) => f.incompleto ? '—' : horas(f.min) },
      { k: 'n', t: 'Novedades', orden: false, render: (f) => <span className="fila" style={{ gap: 4 }}>{f.tarde > 0 && <Insignia tono="aviso">tarde {f.tarde}′</Insignia>}{f.extra > 0 && <Insignia tono="info">extra {horas(f.extra)}</Insignia>}{f.incompleto && <Insignia tono="peligro">sin salida</Insignia>}{f.marcas.some((m) => m.estado === 'revisar') && <Insignia tono="peligro">revisar</Insignia>}{f.marcas.some((m) => m.enZona === '0') && <Insignia tono="peligro">fuera de zona</Insignia>}{f.cerrado && <Insignia>cerrado</Insignia>}</span>, texto: (f) => (f.marcas.some((m) => m.estado === 'revisar') ? 'revisar ' : '') + (f.tarde ? 'tarde' : '') },
      { k: 'a', t: '', acciones: true, orden: false, render: (f) => <Boton chico variante="secundario" onClick={() => setDet(f)}>Ver día</Boton> }]}
      filas={l} clave={(f) => f.cedula + f.fecha} vacio="No hay marcaciones en ese rango." />}</Estado>
    <Hoja abierta={!!det} alCerrar={() => setDet(null)} titulo={det ? `${det.nombre} · ${fechaCorta(det.fecha)}` : ''}>{det && <>
      <ul className="lista">{TIPOS.map((t) => { const m = det.marcas.find((x) => x.tipo === t); return <li key={t} style={{ alignItems: 'flex-start' }}><div className="crece"><strong>{NOMBRE_TIPO[t]}</strong> <span className="num">{m ? m.hora.slice(11) : '—'}</span>
        {m && <div className="fila chico" style={{ gap: 4, marginTop: 4 }}><Insignia>{{ en_linea: 'en línea', sin_conexion: 'sin señal', manual: 'digitada', administrador: 'por administrador' }[m.origen] || m.origen}</Insignia>{m.estado === 'revisar' && <Insignia tono="peligro">por revisar</Insignia>}{m.enZona === '0' && <Insignia tono="peligro">a {m.dist} m del centro</Insignia>}{m.enZona === '1' && <Insignia tono="ok">en el centro</Insignia>}{m.fotoExigida && !m.foto && <Insignia tono="aviso">sin foto</Insignia>}</div>}
        {m?.motivo && <div className="suave chico">Motivo: {m.motivo}</div>}
        {m && <div className="fila" style={{ marginTop: 6 }}>{m.lat && <a className="btn texto chico" href={`https://maps.google.com/?q=${m.lat},${m.lng}`} target="_blank" rel="noreferrer"><MapPin size={16} aria-hidden="true" />Mapa</a>}{m.foto && <Boton chico variante="texto" icono={Image} onClick={() => verFoto(m.foto)}>Foto</Boton>}{m.estado === 'revisar' && !soloVer && <Boton chico variante="texto" onClick={() => revisada(m.id)}>Dar por revisada</Boton>}</div>}</div>
        {!det.cerrado && !soloVer && <Boton chico variante="secundario" icono={Pencil} onClick={() => setAj({ cedula: det.cedula, fecha: det.fecha, tipo: t, hora: m ? m.hora.slice(11) : '', motivo: '', existe: !!m })}>{m ? 'Corregir' : 'Agregar'}</Boton>}</li>; })}</ul>
      {det.cerrado && <Aviso>Este día pertenece a una nómina cerrada y ya no se puede modificar.</Aviso>}</>}</Hoja>
    <Hoja abierta={!!aj} alCerrar={() => setAj(null)} titulo={aj ? `${aj.existe ? 'Corregir' : 'Agregar'}: ${NOMBRE_TIPO[aj.tipo]}` : ''} alto={0.6}>{aj && <>
      <Campo etiqueta="Hora correcta" type="time" value={aj.hora} onChange={(e) => setAj({ ...aj, hora: e.target.value })} />
      <Campo como="textarea" etiqueta="Motivo del ajuste" ayuda="Queda en el registro de auditoría con tu usuario." value={aj.motivo} onChange={(e) => setAj({ ...aj, motivo: e.target.value })} />
      <div className="acciones-hoja">{aj.existe && <Boton variante="texto" onClick={() => { setAj({ ...aj, anular: true }); }} disabled={aj.motivo.trim().length < 5}>{aj.anular ? 'Se anulará al guardar' : 'Anular marcación'}</Boton>}<Boton cargando={ocupado} disabled={aj.motivo.trim().length < 5 || (!aj.anular && !aj.hora)} onClick={guardarAjuste}>{aj.anular ? 'Confirmar anulación' : 'Guardar ajuste'}</Boton></div></>}</Hoja>
    <Hoja abierta={!!foto} alCerrar={() => setFoto(null)} titulo="Foto de la marcación" alto={0.7}>{foto?.url ? <img src={foto.url} alt="Foto tomada al marcar" style={{ borderRadius: 12, width: '100%' }} /> : <div className="esqueleto" style={{ height: 300 }} />}</Hoja>
  </>;
}

/* ---------- Estructura ---------- */
const MENU = [['Día a día', [['tablero', 'Hoy', LayoutDashboard], ['marcaciones', 'Marcaciones', ClipboardList, 'revisar'], ['permisos', 'Permisos', CalendarCheck, 'permisos'], ['extras', 'Horas extra', Timer, 'extras'], ['incapacidades', 'Incapacidades', Stethoscope]]],
  ['Pago', [['informes', 'Informes', BarChart3], ['nomina', 'Nómina y desprendibles', Wallet], ['obras', 'Resumen por obra', FileSpreadsheet]]],
  ['Empresa', [['personal', 'Personal', Users, 'usuarios'], ['centros', 'Centros de trabajo', Building2], ['turnos', 'Turnos', CalendarClock], ['alertas', 'Alertas', BellRing], ['config', 'Configuración', Settings], ['sistema', 'Sistema y respaldo', HeartPulse]]]];
export default function Admin({ yo, recargarYo, alSalir }) {
  window.__yo = yo;
  const [vista, setVista] = useState('tablero'), centrosC = useCarga(() => api('adminCentros'), []), pend = useCarga(() => api('adminTablero').then((d) => d.pendientes), [vista === 'tablero']), sup = yo.usuario.rol !== 'admin';
  const menu = sup ? [['Mi equipo', MENU[0][1].filter((x) => ['tablero', 'marcaciones', 'permisos', 'extras'].includes(x[0])).concat([['informes', 'Informes', BarChart3]])]] : MENU;
  const centros = centrosC.datos || [], ir = (v) => { setVista(v); window.scrollTo(0, 0); }, n = (k) => (k && pend.datos ? pend.datos[k] : 0);
  const comun = { centros, cfg: yo.cfg, ir, soloVer: sup };
  return <div className="admin">
    <nav className="admin-nav no-imprimir" aria-label="Administración">{menu.map(([g, items]) => <div key={g}><h2>{g}</h2>{items.map(([k, t, I, c]) => <button key={k} aria-current={vista === k ? 'page' : undefined} onClick={() => ir(k)}><I size={18} aria-hidden="true" />{t}{n(c) > 0 && <span className="cuenta" aria-label={`${n(c)} pendientes`}>{n(c)}</span>}</button>)}</div>)}
      <div style={{ marginTop: 16, borderTop: '1px solid var(--c-borde)', paddingTop: 8 }}><button onClick={alSalir}><LogOut size={18} aria-hidden="true" />Cerrar sesión</button></div></nav>
    <div className="admin-movil no-imprimir"><Campo como="select" etiqueta="Sección de administración" value={vista} onChange={(e) => ir(e.target.value)}>{menu.map(([g, items]) => <optgroup key={g} label={g}>{items.map(([k, t, , c]) => <option key={k} value={k}>{t}{n(c) > 0 ? ` (${n(c)})` : ''}</option>)}</optgroup>)}</Campo></div>
    <main className="admin-cuerpo" id="contenido" tabIndex={-1}>
      {vista === 'tablero' && <Tablero ir={ir} />}
      {vista === 'personal' && <Personal {...comun} />}
      {vista === 'centros' && <Centros {...comun} recargar={() => { centrosC.recargar(true); recargarYo(); }} />}
      {vista === 'marcaciones' && <Marcaciones {...comun} />}
      {vista === 'permisos' && <Permisos {...comun} />}
      {vista === 'extras' && <Extras {...comun} />}
      {vista === 'incapacidades' && <Incapacidades {...comun} />}
      {vista === 'nomina' && <Nomina {...comun} />}
      {vista === 'obras' && <Obras {...comun} />}
      {vista === 'alertas' && <Alertas {...comun} />}
      {vista === 'config' && <Config {...comun} recargarYo={recargarYo} />}
      {vista === 'sistema' && <Sistema {...comun} />}
      {vista === 'turnos' && <Turnos {...comun} />}
      {vista === 'informes' && <Informes {...comun} />}
    </main>
  </div>;
}
