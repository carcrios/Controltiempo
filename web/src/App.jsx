import React, { useCallback, useEffect, useState } from 'react';
import { Clock, LogOut, ShieldCheck, UserRound, WifiOff } from 'lucide-react';
import { api, sesion, configurada, alCaducarSesion, VERSION } from './api.js';
import { Avisos, Boton, Aviso, Casilla, Esqueleto, useAvisos } from './ui.jsx';
import Acceso from './Acceso.jsx';
import Legal, { PieLegal } from './Legal.jsx';
import Firma from './Firma.jsx';
import Trabajador from './Trabajador.jsx';
import Admin from './Admin.jsx';

const ruta = () => location.hash.replace(/^#\/?/, '').split('/');
function useRuta() { const [r, setR] = useState(ruta); useEffect(() => { const f = () => { setR(ruta()); window.scrollTo(0, 0); }; window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []); return r; }
function useEnLinea() { const [v, setV] = useState(navigator.onLine); useEffect(() => { const a = () => setV(true), b = () => setV(false); window.addEventListener('online', a); window.addEventListener('offline', b); return () => { window.removeEventListener('online', a); window.removeEventListener('offline', b); }; }, []); return v; }

// La marca (nombre, logo y color) llega de la configuración de la empresa: nada está escrito en el código.
function aplicarMarca(empresa) {
  if (!empresa) return;
  document.title = empresa.nombre ? `${empresa.nombre} · Control de jornada` : 'Control de jornada';
  const c = empresa.color, raiz = document.documentElement.style;
  if (!/^#[0-9a-f]{6}$/i.test(c || '')) { ['--c-primario', '--c-primario-fuerte', '--c-sobre-primario'].forEach((k) => raiz.removeProperty(k)); return; }
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) return; // en modo oscuro se conserva la paleta accesible
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)), lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  raiz.setProperty('--c-primario', c);
  raiz.setProperty('--c-primario-fuerte', `rgb(${[r, g, b].map((x) => Math.round(x * 0.75)).join(',')})`);
  raiz.setProperty('--c-sobre-primario', lum > 0.6 ? '#14242A' : '#FFFFFF');
}

export function Cabecera({ empresa, children }) {
  return <header className="cabecera no-imprimir"><div className="marca">{empresa?.logo ? <img src={empresa.logo} alt="" /> : <Clock size={26} aria-hidden="true" />}<strong>{empresa?.nombre || 'Control de jornada'}</strong></div>{children}</header>;
}

function SinConfigurar() {
  return <main className="lectura" id="contenido"><h1>Falta un paso de instalación</h1>
    <p className="suave">La página ya está publicada, pero todavía no sabe a qué hoja de cálculo conectarse.</p>
    <ol><li>Abre el archivo <code>config.js</code> del repositorio.</li><li>Pega en <code>API_URL</code> la dirección de la aplicación web de Apps Script (termina en <code>/exec</code>).</li><li>Guarda el cambio y recarga esta página.</li></ol>
    <p>El paso a paso completo está en el archivo <code>LEEME.md</code>.</p></main>;
}

function Reconsentir({ empresa, alListo }) {
  const [a, setA] = useState(false), [b, setB] = useState(false), [c, setC] = useState(false), avisos = useAvisos();
  const enviar = async () => { setC(true); try { await api('consentir', { datos: a, sensibles: b }); alListo(); } catch (e) { avisos.error(e); } finally { setC(false); } };
  return <main className="acceso" id="contenido"><div className="acceso-caja pila"><h1>Actualizamos las políticas</h1>
    <p className="suave">{empresa?.nombre} actualizó la política de tratamiento de datos. Para seguir usando la aplicación revisa y autoriza de nuevo.</p>
    <Casilla checked={a} onChange={(e) => setA(e.target.checked)}>Leí y acepto la <a href="#/legal/privacidad">política de privacidad</a> y los <a href="#/legal/terminos">términos de uso</a>.</Casilla>
    <Casilla checked={b} onChange={(e) => setB(e.target.checked)}>Autorizo el uso de mi <strong>ubicación</strong> y de mi <strong>fotografía</strong> al marcar, como se explica en <a href="#/legal/permisos">permisos y consentimiento</a>.</Casilla>
    <Boton cargando={c} disabled={!a || !b} onClick={enviar}>Autorizar y continuar</Boton></div></main>;
}

function Principal({ alSalir }) {
  const [yo, setYo] = useState(() => sesion.yo), [error, setError] = useState(null), [modoSel, setModo] = useState(null);
  const avisos = useAvisos(), enLinea = useEnLinea();
  const cargar = useCallback(async () => {
    try { const d = await api('yo', { base: location.origin + location.pathname }); sesion.yo = d; setYo(d); setError(null); aplicarMarca(d.cfg.empresa); return d; }
    catch (e) { if (e.cod !== 'SESION') setError(e); return null; }
  }, []);
  useEffect(() => { cargar(); const alVolver = () => { if (document.visibilityState === 'visible') cargar(); }; document.addEventListener('visibilitychange', alVolver); window.addEventListener('online', cargar); return () => { document.removeEventListener('visibilitychange', alVolver); window.removeEventListener('online', cargar); }; }, [cargar]);
  const actualizar = useCallback((parcial) => setYo((y) => { const n = { ...y, ...parcial }; sesion.yo = n; return n; }), []);
  const salir = async () => { try { await api('salir'); } catch { /* sin señal: se cierra localmente */ } sesion.cerrar(); alSalir(); };

  if (!yo) return <><Cabecera /><main className="contenido" id="contenido">{error ? <div className="pila"><Aviso tono="peligro">{error.message}</Aviso><Boton onClick={cargar}>Reintentar</Boton><Boton variante="texto" onClick={salir}>Cerrar sesión</Boton></div> : <div className="pila" role="status"><span className="oculto-visual">Cargando tu información…</span><div className="esqueleto" style={{ height: 260, borderRadius: 16 }} /><Esqueleto lineas={4} /></div>}</main></>;
  const u = yo.usuario, empresa = yo.cfg.empresa;
  const modo = modoSel || (u.rol === 'admin' && window.innerWidth > 900 ? 'admin' : 'yo');
  if (u.consVersion !== yo.cfg.versionLegal) return <Reconsentir empresa={empresa} alListo={cargar} />;
  if (u.estado !== 'activo') return <><Cabecera empresa={empresa}><Boton variante="texto" chico icono={LogOut} onClick={salir}>Salir</Boton></Cabecera>
    <main className="acceso" id="contenido"><div className="acceso-caja pila"><h1>Tu registro está en revisión</h1><p className="suave">Hola {u.nombre.split(' ')[0]}. El administrador de {empresa.nombre} debe aprobar tu usuario antes de que puedas marcar. Cuando lo haga, toca “Revisar de nuevo”.</p><Boton onClick={() => cargar().then((d) => d && d.usuario.estado !== 'activo' && avisos.info('Aún no ha sido aprobado.'))}>Revisar de nuevo</Boton></div></main></>;
  return <div className="app">
    <Cabecera empresa={empresa}>
      {u.rol === 'admin' && <Boton variante="texto" chico icono={modo === 'admin' ? UserRound : ShieldCheck} onClick={() => setModo(modo === 'admin' ? 'yo' : 'admin')}>{modo === 'admin' ? 'Mi jornada' : 'Administrar'}</Boton>}
    </Cabecera>
    {!enLinea && <div className="banda no-imprimir" role="status"><WifiOff size={16} style={{ display: 'inline', verticalAlign: '-3px' }} aria-hidden="true" /> Sin conexión. Puedes marcar: se guardará en tu celular y se enviará al volver la señal.</div>}
    {modo === 'admin' && u.rol === 'admin' ? <Admin yo={yo} recargarYo={cargar} alSalir={salir} /> : <Trabajador yo={yo} actualizar={actualizar} recargar={cargar} alSalir={salir} />}
  </div>;
}

export default function App() {
  const r = useRuta(), [token, setToken] = useState(() => sesion.token), [publico, setPublico] = useState(() => sesion.publico);
  useEffect(() => { alCaducarSesion(() => setToken(null)); }, []);
  useEffect(() => { aplicarMarca(publico?.empresa); if (!configurada()) return; api('publico').then((p) => { sesion.publico = p; setPublico(p); aplicarMarca(p.empresa); }).catch(() => {}); }, []); // eslint-disable-line
  let vista;
  if (r[0] === 'legal') vista = <Legal pagina={r[1]} empresa={publico?.empresa} />;
  else if (!configurada()) vista = <SinConfigurar />;
  else if (r[0] === 'firma') vista = <Firma codigo={r[1]} />;
  else if (!token) vista = <><Acceso publico={publico} alEntrar={(t, usuario) => { sesion.token = t; sesion.yo = null; setToken(t); }} /><PieLegal /></>;
  else vista = <Principal alSalir={() => setToken(null)} />;
  return <Avisos>{vista}<span className="oculto-visual">Versión {VERSION}</span></Avisos>;
}
