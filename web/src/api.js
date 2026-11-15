// Cliente de la API (Apps Script). Sesión persistente, bandeja de salida sin señal y reporte de errores.
export const VERSION = '1.0.0';
const URL_API = (window.CONFIG && window.CONFIG.API_URL) || '';
const K = { token: 'cj.token', yo: 'cj.yo', salida: 'cj.salida', publico: 'cj.publico' };

export const guardado = {
  leer(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
  poner(k, v) { try { if (v === null || v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* almacenamiento lleno o bloqueado */ } }
};
export const sesion = {
  get token() { return guardado.leer(K.token, null); },
  set token(t) { guardado.poner(K.token, t); },
  get yo() { return guardado.leer(K.yo, null); },
  set yo(v) { guardado.poner(K.yo, v); },
  get publico() { return guardado.leer(K.publico, null); },
  set publico(v) { guardado.poner(K.publico, v); },
  cerrar() { [K.token, K.yo, K.salida].forEach((k) => guardado.poner(k, null)); }
};
export const configurada = () => !!URL_API;

export class ErrorApi extends Error { constructor(cod, msg) { super(msg); this.cod = cod; } }
const equipo = () => (navigator.userAgent || '').slice(0, 110);
let alCaducar = () => {};
export const alCaducarSesion = (f) => { alCaducar = f; };

export async function api(a, d = {}, { espera = 45000 } = {}) {
  if (!URL_API) throw new ErrorApi('CONFIG', 'Falta configurar la dirección del servidor en config.js.');
  if (!navigator.onLine) throw new ErrorApi('RED', 'No hay conexión a internet.');
  const ctl = new AbortController(), reloj = setTimeout(() => ctl.abort(), espera);
  let res;
  try {
    // text/plain evita la verificación previa (CORS) que Apps Script no responde.
    res = await fetch(URL_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ a, d, t: sesion.token, v: VERSION }), redirect: 'follow', signal: ctl.signal });
  } catch (e) { throw new ErrorApi('RED', ctl.signal.aborted ? 'El servidor tardó demasiado en responder.' : 'No se pudo conectar con el servidor.'); }
  finally { clearTimeout(reloj); }
  let j; try { j = await res.json(); } catch { throw new ErrorApi('RED', 'El servidor respondió algo inesperado. Intenta de nuevo.'); }
  if (!j.ok) { if (j.e === 'SESION' && sesion.token) { sesion.cerrar(); alCaducar(); } throw new ErrorApi(j.e, j.m); }
  return j.d;
}
export const reintentable = (e) => e && (e.cod === 'RED' || e.cod === 'OCUPADO');
export const info = () => ({ equipo: equipo() });

/* ---------- Bandeja de salida: marcaciones hechas sin señal ---------- */
export const bandeja = {
  lista: () => guardado.leer(K.salida, []),
  agregar(m) { const l = bandeja.lista(); l.push(m); guardado.poner(K.salida, l); },
  async enviar() {
    let l = bandeja.lista(), enviadas = 0, ultimo = null; const fallidas = [];
    for (const m of l) {
      try { ultimo = await api('marcar', { ...m, offline: true }); enviadas++; }
      catch (e) { if (reintentable(e)) { fallidas.push(m); } else { fallidas.push({ ...m, rechazo: e.message }); } }
    }
    guardado.poner(K.salida, fallidas.filter((m) => !m.rechazo));
    return { enviadas, pendientes: fallidas.filter((m) => !m.rechazo).length, rechazadas: fallidas.filter((m) => m.rechazo), ultimo };
  },
  descartar(id) { guardado.poner(K.salida, bandeja.lista().filter((m) => m.id !== id)); }
};

/* ---------- Monitoreo: los errores del navegador llegan a la hoja "Errores" ---------- */
let enviados = 0;
export function reportarError(mensaje, detalle) {
  if (!URL_API || enviados >= 5 || !navigator.onLine) return; enviados++;
  const yo = sesion.yo;
  fetch(URL_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, keepalive: true,
    body: JSON.stringify({ a: 'error', d: { mensaje: String(mensaje).slice(0, 400), detalle: String(detalle || '').slice(0, 1500), cedula: yo && yo.usuario ? yo.usuario.cedula : '', equipo: equipo(), version: VERSION } }) }).catch(() => {});
}
export function vigilarErrores() {
  window.addEventListener('error', (e) => reportarError(e.message, (e.filename || '') + ':' + e.lineno + ' ' + ((e.error && e.error.stack) || '')));
  window.addEventListener('unhandledrejection', (e) => { const r = e.reason; if (r instanceof ErrorApi) return; reportarError('Promesa sin atender: ' + (r && r.message ? r.message : r), r && r.stack); });
}
