# Control de jornada

Aplicación web instalable (PWA) para registrar entradas, salidas y almuerzo, tramitar permisos,
llevar incapacidades y horas extra, y ver desprendibles de pago. Normativa colombiana vigente a
noviembre de 2026. Los datos viven en **una hoja de Google Sheets de la empresa**; la página se
publica en **GitHub Pages**.

Una hoja de cálculo = una empresa. Nada de la empresa está escrito en el código: nombre, logo,
horarios, jefes, alertas y parámetros legales se configuran desde el panel del administrador.

```
apps-script/   Backend (se pega en el editor de Apps Script de la hoja)
docs/          Sitio ya compilado: es lo que publica GitHub Pages
web/           Código fuente de la página (React + InteraUI). Solo si vas a modificarla
tests/         Pruebas automáticas y servidor de demostración local
```

## Instalación (unos 20 minutos)

### 1. Hoja de cálculo y backend
1. Crea una hoja de Google Sheets vacía en la cuenta de Google **de la empresa** (no una personal).
2. Extensiones → Apps Script. Borra el contenido de `Código.gs`.
3. Crea cuatro archivos de secuencia de comandos y pega en cada uno el contenido de
   `apps-script/Motor.gs`, `Base.gs`, `Servicios.gs` y `Tareas.gs`.
4. Configuración del proyecto (engranaje) → activa «Mostrar el archivo de manifiesto appsscript.json»
   y reemplázalo por el de `apps-script/appsscript.json`.
5. Vuelve a la hoja, recárgala y usa el menú **Control de jornada → 1. Instalar o reparar**.
   Acepta los permisos. Al terminar verás el **código del primer administrador**: anótalo.
6. En Apps Script: Implementar → Nueva implementación → tipo **Aplicación web** →
   Ejecutar como: **Yo** · Quién tiene acceso: **Cualquier persona** → Implementar.
   Copia la URL que termina en `/exec`.

### 2. Página en GitHub
1. Crea un repositorio y sube todo el contenido de esta carpeta.
2. Edita `docs/config.js` y pega la URL `/exec` en `API_URL`.
3. Settings → Pages → Source: **Deploy from a branch** → rama `main`, carpeta **/docs**.
4. Abre la dirección que te da GitHub (`https://usuario.github.io/repositorio/`).

> El repositorio puede ser público: no contiene datos de personas ni claves. Nunca subas a él
> listados de personal.

### 3. Primer ingreso
1. En la página escribe tu cédula → «Crea tu cuenta» → en *Código de activación* pon el código
   del primer administrador.
2. En **Configuración** completa los datos de la empresa, el correo de alertas y los jefes que
   firman (cada uno con su clave de firma).
3. En **Centros de trabajo** crea cada obra con su horario y ubicación.
4. En **Personal** agrega las personas (o importa un Excel con columnas Cédula, Nombre, Cargo,
   Salario, Centro, Ingreso, Correo, Celular). Cada una recibe un código de un solo uso.
5. Cada trabajador entra con su cédula, pone el código, crea su contraseña y autoriza el
   tratamiento de datos. En su celular: menú del navegador → «Instalar aplicación».

## Cómo se actualiza
- **Backend:** pega los archivos nuevos en Apps Script → Implementar → Gestionar implementaciones →
  lápiz → Versión: *Nueva versión*. La URL no cambia.
- **Página:** `cd web && npm install && npm run build` y sube la carpeta `docs/`
  (vuelve a poner tu `API_URL` en `docs/config.js`).

## Pruebas de funcionamiento
```
node tests/motor.test.js     # 33 pruebas del cálculo de jornada y nómina
node tests/api.test.js       # 50 pruebas de extremo a extremo, incluidos intentos de ataque
```
Corren solas en cada cambio (GitHub Actions). Dentro de la aplicación, **Sistema y respaldo**
ejecuta 8 comprobaciones sobre la instalación real.

Demostración local con datos de ejemplo:
`cd web && npm install && npm run build && cd .. && node tests/servidor-local.js` → http://localhost:8787
(administrador 79000001 / demo2026 · trabajador 1020333444 / demo2026 · clave de firma 4821).

## Copias de seguridad y restauración
- Automática cada 7 días (configurable) en la carpeta «Control de jornada - Copias de seguridad»
  del Drive de la empresa; conserva las últimas 8. También manual desde el panel.
- **Restaurar:** abre la copia deseada → Extensiones → Apps Script (el código viaja con la copia) →
  ejecuta `instalar` → crea una implementación nueva → actualiza `API_URL` en `docs/config.js`.
  Los usuarios deben ingresar de nuevo. Prueba este procedimiento una vez antes de necesitarlo.

## Seguridad y datos
- Contraseñas y claves de firma: hash con sal; nunca en claro. Sesión de 90 días por dispositivo.
- Activación de cuenta con código de un solo uso (nadie puede reclamar la cédula de otro).
- Un permiso solo llega a la nómina con la firma de cada jefe (enlace + clave personal) y la
  aprobación final del administrador en pantalla.
- Límite de intentos en ingreso, códigos y claves de firma. Auditoría de todo cambio.
- Fotos comprimidas en el celular (≈ 100 kB), guardadas en carpeta privada y borradas a los
  30 días; coordenadas borradas a los 12 meses. Corre solo, sin abrir el panel.
- No se guarda el diagnóstico de las incapacidades.
- Periodo de nómina cerrado = inmutable.

## Monitoreo y errores
- Los errores del navegador y del servidor se guardan en la hoja `Errores` y se ven en
  **Sistema y respaldo → Errores**. Las fallas de tareas automáticas generan alerta por correo.
- El mismo panel muestra tareas activas, cupo diario de correo y capacidad usada.

## Límites que conviene conocer
- **Recordatorios:** con la aplicación abierta o en segundo plano, el aviso sale en el celular
  5 minutos antes de la entrada y 5 después de la salida (igual en almuerzo). Con la aplicación
  cerrada, un sitio en GitHub Pages no puede enviar notificaciones push; para eso activa el
  recordatorio por correo en **Alertas**.
- **WhatsApp:** la aplicación abre WhatsApp con el mensaje y el enlace de firma listos; quien
  envía es el trabajador. No hay envío automático (requeriría WhatsApp Business API, de pago).
- **Correo:** una cuenta de Gmail gratuita envía 100 correos al día; Google Workspace, 1.500.
- **Tamaño:** pensada para hasta unas 150 personas por hoja. Las respuestas tardan 1 a 3 segundos
  (es el tiempo normal de Apps Script).
- **Nómina:** es una liquidación estimada (salario, recargos, extras, auxilio de transporte,
  salud y pensión). No incluye prestaciones, retención en la fuente, embargos ni préstamos, y no
  reemplaza la nómina electrónica ante la DIAN.
- Los textos legales son modelos: deben ser revisados por un abogado antes de usarse.

## Parámetros legales por defecto (editables en Configuración)
| Concepto | Valor | Norma |
|---|---|---|
| Jornada máxima semanal | 42 h (divisor 210) | Ley 2101 de 2021 |
| Jornada nocturna | 19:00 a 06:00, recargo 35 % | Ley 2466 de 2025 |
| Hora extra diurna / nocturna | 25 % / 75 % | CST art. 168 |
| Dominical y festivo | 90 % hasta jun-2027, luego 100 % | Ley 2466 de 2025 |
| Tope de horas extra | 2 por día, 12 por semana | Ley 50 de 1990 |
| Salario mínimo / auxilio de transporte 2026 | $1.750.905 / $249.095 | Decretos de 2025 |
| Festivos | Calculados cada año | Ley 51 de 1983 |
