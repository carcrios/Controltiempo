// Prepara lo que se entrega: un solo archivo de Apps Script para la plantilla y el sitio compilado.
// Uso: node herramientas/empaquetar.js https://TU-USUARIO.github.io/TU-REPOSITORIO/
const fs = require('fs'), path = require('path');
const raiz = path.join(__dirname, '..'), url = (process.argv[2] || '').trim();
if (url && !/^https:\/\/[^\s"']+\/$/.test(url)) { console.error('La dirección debe empezar por https:// y terminar en /'); process.exit(1); }
const partes = ['Motor.gs', 'Base.gs', 'Servicios.gs', 'Turnos.gs', 'Informes.gs', 'Modulos.gs', 'Tareas.gs'].map((f) => {
  let s = fs.readFileSync(path.join(raiz, 'apps-script', f), 'utf8');
  if (f === 'Motor.gs') s = s.replace("if (typeof module !== 'undefined') module.exports = Motor;", '');
  if (f === 'Base.gs' && url) s = s.replace("var APP_PREDETERMINADA = '';", `var APP_PREDETERMINADA = '${url}';`);
  return `// ===================== ${f} =====================\n` + s;
});
const version = /var VERSION = '([^']+)'/.exec(partes.join(''))[1];
const salida = path.join(raiz, 'instalacion');
fs.mkdirSync(salida, { recursive: true });
fs.writeFileSync(path.join(salida, 'ControlJornada.gs'), `/* Control de jornada ${version} — archivo único para pegar en Apps Script (Extensiones → Apps Script).\n   Generado por herramientas/empaquetar.js: no lo edites a mano. */\n\n` + partes.join('\n\n'));
fs.copyFileSync(path.join(raiz, 'apps-script', 'appsscript.json'), path.join(salida, 'appsscript.json'));
console.log(`Listo: instalacion/ControlJornada.gs (${version})${url ? ' con la página ' + url : ' SIN página predeterminada: los clientes tendrán que pegar el código de conexión'}`);
