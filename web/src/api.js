// Cliente de la API (Apps Script). Conexión por empresa, sesión persistente, bandeja de salida sin señal y reporte de errores.
export const VERSION = '1.4.0';
const CFG = window.CONFIG || {};
const FIJA = CFG.API_URL || '';                                   // una sola empresa: dirección escrita en config.js
const BASE = CFG.BASE_API || 'https://script.google.com/macros/s/'; // varias empresas: cada una entra con su enlace
const K = { token: 'cj.token', yo: 'cj.yo', salida: 'cj.salida', publico: 'cj.publico', api: 'cj.api', rech: 'cj.rechazadas', desfase: 'cj.desfase', disp: 'cj.dispositivo' };

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
  // Al caducar la sesión NO se borran las marcaciones pendientes: se envían tras ingresar de nuevo.
  cerrar(todo) { [K.token, K.yo].concat(todo ? [K.salida, K.rech] : []).forEach((k) => guardado.poner(k, null)); }
};

/* ---------- Conexión con la empresa ---------- */
const RE_ID = /^[A-Za-z0-9_-]{20,200}$/;
export const urlDeId = (id) => BASE + id + '/exec';
export function idDeTexto(t) { // acepta el código, el enlace de la aplicación o la dirección /exec
  t = String(t || '').trim(); const m = /\/s\/([A-Za-z0-9_-]{20,200})\//.exec(t) || /#\/c\/([A-Za-z0-9_-]{20,200})/.exec(t), id = m ? m[1] : t;
  return RE_ID.test(id) ? id : '';
}
export const conexion = {
  fija: !!FIJA,
  get id() { return FIJA ? '' : guardado.leer(K.api, ''); },
  get url() { return FIJA || (conexion.id ? urlDeId(conexion.id) : ''); },
  poner(id) { sesion.cerrar(true); guardado.poner(K.publico, null); guardado.poner(K.api, id); },
  enlace() { return location.origin + location.pathname + (conexion.id ? '#/c/' + conexion.id : ''); }
};
export const configurada = () => !!conexion.url;

export class ErrorApi extends Error { constructor(cod, msg) { super(msg); this.cod = cod; } }
const equipo = () => (navigator.userAgent || '').slice(0, 110);
let alCaducar = () => {};
export const alCaducarSesion = (f) => { alCaducar = f; };

export async function api(a, d = {}, { espera = 45000, url, reintentos = 3 } = {}) {
  const destino = url || conexion.url;
  if (!destino) throw new ErrorApi('CONFIG', 'Esta aplicación aún no está conectada con una empresa.');
  if (!navigator.onLine) throw new ErrorApi('RED', 'No hay conexión a internet.');
  for (let intento = 0; intento <= reintentos; intento++) {
    const ctl = new AbortController(), reloj = setTimeout(() => ctl.abort(), espera);
    let res;
    try {
      // text/plain evita la verificación previa (CORS) que Apps Script no responde.
      res = await fetch(destino, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ a, d, t: url ? null : sesion.token, v: VERSION }), redirect: 'follow', signal: ctl.signal });
    } catch (e) { throw new ErrorApi('RED', ctl.signal.aborted ? 'El servidor tardó demasiado en responder.' : 'No se pudo conectar con el servidor.'); }
    finally { clearTimeout(reloj); }
    let j; try { j = await res.json(); } catch { throw new ErrorApi('RED', 'El servidor respondió algo inesperado. Intenta de nuevo.'); }
    if (!j.ok) {
      if (j.e === 'OCUPADO' && intento < reintentos) {
        const pausa = Math.round((600 * Math.pow(2, intento)) + Math.random() * 400);
        await new Promise((r) => setTimeout(r, pausa));
        continue;
      }
      if (j.e === 'SESION' && sesion.token && !url) { sesion.cerrar(false); alCaducar(); }
      throw new ErrorApi(j.e, j.m);
    }
    return j.d;
  }
}
export const reintentable = (e) => e && (e.cod === 'RED' || e.cod === 'OCUPADO');
function dispositivoId() {
  let id = guardado.leer(K.disp, '');
  if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2)); guardado.poner(K.disp, id); }
  return id;
}
export const info = () => ({ equipo: equipo(), dispositivoId: dispositivoId() });

/* ---------- Reloj: corrige la hora del celular con la del servidor para las marcaciones sin señal ---------- */
const naive = (iso) => { const p = /(\d+)-(\d+)-(\d+)T(\d+):(\d+)/.exec(iso); return p ? Date.UTC(+p[1], +p[2] - 1, +p[3], +p[4], +p[5]) : NaN; };
export const reloj = {
  poner(isoServidor) { const n = new Date(), local = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate(), n.getHours(), n.getMinutes()), d = naive(isoServidor) - local; if (!isNaN(d)) guardado.poner(K.desfase, Math.abs(d) > 90000 ? d : 0); },
  ahora() { return new Date(Date.now() + (guardado.leer(K.desfase, 0) || 0)); }
};

/* ---------- Bandeja de salida: marcaciones hechas sin señal (IndexedDB con respaldo en memoria) ---------- */
let enviando = null;
let colaMem = guardado.leer(K.salida, []);
const idb = (() => {
  if (typeof indexedDB === 'undefined') return null;
  let dbp = null;
  const abrir = () => dbp || (dbp = new Promise((ok, mal) => {
    const r = indexedDB.open('cj_offline', 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('salida')) r.result.createObjectStore('salida', { keyPath: 'id' }); };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  }));
  const tx = (modo, fn) => abrir().then((db) => new Promise((ok, mal) => {
    const t = db.transaction('salida', modo), s = t.objectStore('salida'), req = fn(s);
    t.oncomplete = () => ok(req && req.result);
    t.onerror = () => mal(t.error);
  })).catch(() => null);
  return {
    todo: () => tx('readonly', (s) => s.getAll()),
    poner: (m) => tx('readwrite', (s) => s.put(m)),
    borrar: (id) => tx('readwrite', (s) => s.delete(id)),
    limpiar: () => tx('readwrite', (s) => s.clear())
  };
})();
if (idb) {
  idb.todo().then((rows) => {
    if (Array.isArray(rows) && rows.length) {
      const ids = new Set(rows.map((x) => x.id));
      const extras = colaMem.filter((x) => !ids.has(x.id));
      extras.forEach((x) => idb.poner(x));
      colaMem = rows.concat(extras);
    } else if (colaMem.length) {
      colaMem.forEach((x) => idb.poner(x));
    }
    guardado.poner(K.salida, null); // libera cuota de localStorage tras migrar a IndexedDB
  });
}
export const bandeja = {
  lista: () => colaMem.slice(),
  rechazadas: () => guardado.leer(K.rech, []),
  agregar(m) { colaMem = colaMem.filter((x) => x.id !== m.id).concat(m); if (idb) idb.poner(m); else guardado.poner(K.salida, colaMem); },
  quitar(id) { colaMem = colaMem.filter((m) => m.id !== id); if (idb) idb.borrar(id); else guardado.poner(K.salida, colaMem); },
  descartarRechazada(id) { guardado.poner(K.rech, bandeja.rechazadas().filter((m) => m.id !== id)); },
  enviar() {
    if (enviando) return enviando; // un solo envío a la vez
    enviando = (async () => {
      let enviadas = 0; const rechazadas = [];
      for (const m of bandeja.lista()) {
        try { await api('marcar', { ...m, offline: !m.manual }); enviadas++; bandeja.quitar(m.id); }
        catch (e) {
          if (e.cod === 'SESION' || e.cod === 'CONFIG') break;      // se conservan para después del ingreso
          if (reintentable(e)) continue;
          bandeja.quitar(m.id); const { foto, ...resto } = m; rechazadas.push({ ...resto, rechazo: e.message }); // queda visible hasta que el trabajador la atienda
        }
      }
      if (rechazadas.length) guardado.poner(K.rech, bandeja.rechazadas().concat(rechazadas).slice(-10));
      return { enviadas, pendientes: bandeja.lista().length, rechazadas };
    })().finally(() => { enviando = null; });
    return enviando;
  }
};

/* ---------- Monitoreo: los errores del navegador llegan a la hoja "Errores" ---------- */
let enviados = 0;
export function reportarError(mensaje, detalle) {
  if (!conexion.url || enviados >= 5 || !navigator.onLine) return; enviados++;
  const yo = sesion.yo;
  fetch(conexion.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, keepalive: true,
    body: JSON.stringify({ a: 'error', d: { mensaje: String(mensaje).slice(0, 400), detalle: String(detalle || '').slice(0, 1500), cedula: yo && yo.usuario ? yo.usuario.cedula : '', equipo: equipo(), version: VERSION } }) }).catch(() => {});
}
export function vigilarErrores() {
  window.addEventListener('error', (e) => reportarError(e.message, (e.filename || '') + ':' + e.lineno + ' ' + ((e.error && e.error.stack) || '')));
  window.addEventListener('unhandledrejection', (e) => { const r = e.reason; if (r instanceof ErrorApi) return; reportarError('Promesa sin atender: ' + (r && r.message ? r.message : r), r && r.stack); });
}
