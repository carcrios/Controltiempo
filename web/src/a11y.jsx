/* ---------- Accesibilidad: preferencias por persona, dictado por voz y lectura en voz alta ----------
   Todo se guarda en este equipo (localStorage) y se aplica al instante sobre <html>. */
import React, { useEffect, useRef, useState } from 'react';
import { Accessibility, Mic, Square } from 'lucide-react';

const CLAVE = 'cj.accesibilidad';
const BASE = { letra: 'normal', contraste: false, movimiento: false, voz: false, claro: false, subrayar: false };
export function preferencias() { try { return { ...BASE, ...(JSON.parse(localStorage.getItem(CLAVE) || '{}') || {}) }; } catch { return { ...BASE }; } }
export function aplicarPreferencias(p = preferencias()) {
  const h = document.documentElement;
  h.dataset.letra = p.letra; h.dataset.contraste = p.contraste ? 'alto' : ''; h.dataset.movimiento = p.movimiento ? 'reducido' : ''; h.dataset.subrayar = p.subrayar ? 'si' : '';
  if (p.claro) h.dataset.theme = 'light'; else if (h.dataset.theme === 'light') delete h.dataset.theme;
}
function guardarPreferencias(p) { try { localStorage.setItem(CLAVE, JSON.stringify(p)); } catch { /* sin almacenamiento: se aplica solo en esta sesión */ } aplicarPreferencias(p); }

/* Lectura en voz alta (si la persona la activó). Sirve para confirmar marcaciones sin mirar la pantalla. */
export function hablar(texto, forzar = false) {
  try {
    if (!texto || !('speechSynthesis' in window) || (!forzar && !preferencias().voz)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(texto).replace(/\s+/g, ' ')); u.lang = 'es-CO'; u.rate = 0.95;
    const v = window.speechSynthesis.getVoices().find((x) => /^es/i.test(x.lang)); if (v) u.voice = v;
    window.speechSynthesis.speak(u);
  } catch { /* el navegador no lee en voz alta */ }
}

/* Dictado: convierte voz en texto dentro de cualquier campo. Usa el reconocimiento de voz del navegador
   (Chrome y Edge en Android y computador; Safari en iPhone). Si no está disponible, el botón no aparece y
   queda el micrófono del teclado del celular. */
const Reconocedor = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
export const dictadoDisponible = !!Reconocedor;
const NUMEROS = { cero: '0', uno: '1', una: '1', dos: '2', tres: '3', cuatro: '4', cinco: '5', seis: '6', siete: '7', ocho: '8', nueve: '9' };
function aDigitos(t) { return String(t).toLowerCase().split(/\s+/).map((w) => NUMEROS[w] ?? w).join('').replace(/\D/g, ''); }

export function BotonDictar({ valor, alCambiar, numerico, etiqueta }) {
  const [oye, setOye] = useState(false), rec = useRef(null), base = useRef('');
  useEffect(() => () => { try { rec.current?.abort(); } catch { /* ya detenido */ } }, []);
  if (!dictadoDisponible) return null;
  const parar = () => { try { rec.current?.stop(); } catch { /* ya detenido */ } };
  const iniciar = () => {
    try {
      const r = new Reconocedor(); rec.current = r;
      r.lang = 'es-CO'; r.interimResults = true; r.continuous = !numerico; r.maxAlternatives = 1;
      base.current = String(valor || '');
      r.onresult = (ev) => {
        let t = ''; for (let i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript;
        if (numerico) { alCambiar(base.current + aDigitos(t)); return; }
        t = t.trim(); if (!t) return;
        const sep = base.current && !/\s$/.test(base.current) ? ' ' : '';
        const texto = base.current ? t : t.charAt(0).toUpperCase() + t.slice(1);
        alCambiar(base.current + sep + texto);
      };
      r.onend = () => setOye(false);
      r.onerror = (e) => { setOye(false); if (e.error === 'not-allowed' || e.error === 'service-not-allowed') alert('Para dictar, permite el uso del micrófono en tu navegador.'); };
      r.start(); setOye(true); hablar('Te escucho', false);
    } catch { setOye(false); }
  };
  return <button type="button" className={`dictar ${oye ? 'oyendo' : ''}`} onClick={oye ? parar : iniciar}
    aria-pressed={oye} aria-label={oye ? `Dejar de dictar ${etiqueta || ''}` : `Dictar ${etiqueta || 'con la voz'}`} title={oye ? 'Tocar para terminar' : 'Dictar con la voz'}>
    {oye ? <Square size={16} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
    {oye && <span className="oculto-visual" role="status">Escuchando… habla ahora.</span>}
  </button>;
}

/* Panel de opciones de accesibilidad */
export function PanelAccesibilidad() {
  const [p, setP] = useState(preferencias());
  const pon = (k, v) => { const n = { ...p, [k]: v }; setP(n); guardarPreferencias(n); if (k === 'voz' && v) hablar('Lectura en voz alta activada.', true); };
  const Op = ({ k, children, ayuda }) => <label className="casilla"><input type="checkbox" checked={!!p[k]} onChange={(e) => pon(k, e.target.checked)} /><span>{children}{ayuda && <span className="ayuda" style={{ display: 'block' }}>{ayuda}</span>}</span></label>;
  return <div className="pila">
    <fieldset className="pila junta" style={{ border: 0, padding: 0, margin: 0 }}><legend className="etiqueta" style={{ marginBottom: 8 }}>Tamaño de la letra</legend>
      <div className="segmentos" role="radiogroup" aria-label="Tamaño de la letra">{[['normal', 'Normal'], ['grande', 'Grande'], ['muy', 'Muy grande']].map(([v, t]) =>
        <button key={v} type="button" role="radio" aria-checked={p.letra === v} className={p.letra === v ? 'activo' : ''} onClick={() => pon('letra', v)} style={{ fontSize: v === 'normal' ? '1rem' : v === 'grande' ? '1.15rem' : '1.3rem' }}>{t}</button>)}</div></fieldset>
    <Op k="contraste" ayuda="Textos más oscuros y bordes más marcados. Útil a pleno sol en la obra.">Alto contraste</Op>
    <Op k="voz" ayuda="La aplicación dice en voz alta los avisos, por ejemplo «Entrada registrada a las 6 y 55».">Leer los avisos en voz alta</Op>
    <Op k="movimiento" ayuda="Quita animaciones y el pulso de los botones.">Reducir el movimiento</Op>
    <Op k="subrayar">Subrayar todos los enlaces y botones de texto</Op>
    <Op k="claro" ayuda="Si el celular está en modo oscuro y prefieres ver la aplicación clara.">Usar siempre el tema claro</Op>
    <div className="aviso info" role="note"><Mic size={20} aria-hidden="true" /><div className="crece">{dictadoDisponible
      ? 'Para dictar, toca el micrófono que aparece al lado de cada casilla de texto y habla. Para números (cédula, celular) puedes decirlos uno por uno.'
      : 'Este navegador no permite dictar dentro de la aplicación. Usa el micrófono de tu teclado: aparece al tocar cualquier casilla de texto.'}</div></div>
  </div>;
}

export function IconoAccesibilidad(props) { return <Accessibility {...props} />; }
