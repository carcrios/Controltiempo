# Cambios

## 1.7.0 — 2026-11-20 (unión con las mejoras de la versión del aliado)
- «Salir a mi permiso»: cuando el trabajador tiene un permiso aprobado para hoy, aparece arriba de su jornada con el botón para salir. Guarda la hora real y la ubicación; si no regresa ese día, cierra la jornada con la salida. En permisos por horas aparece después «Regresé del permiso». Si sale antes o regresa después de lo aprobado, llega una alerta. El panel muestra la salida y el regreso reales en Permisos.
- Accesibilidad: botón en todas las pantallas (también ingreso y kiosco) con tamaño de letra (normal, grande, muy grande), alto contraste, lectura de avisos en voz alta, reducir movimiento, subrayar enlaces y tema claro fijo. Dictado por voz con micrófono en todas las casillas de texto y buscadores (para números se pueden decir dígito por dígito). El kiosco confirma cada marcación en voz alta. Revisión automática WCAG 2.1 AA (axe) sin errores en las 27 pantallas principales.
- Diseño: saludo con el nombre y la hora para el trabajador, el administrador y el kiosco; una sola acción de marcar (las demás en «Otras opciones»); pasos de la jornada más claros; lo ganado en grande con barra de avance del periodo; menú del panel con buscador, nombres cortos y grupos plegables; indicadores que resaltan lo que pide atención; gráfica «Cómo va cada obra hoy»; kiosco con logo, obra y reloj grande; fechas con año en documentos para firma.
- Revisada en cuatro rondas por cuatro revisores (comprador de Gestión Humana, seguridad y Ley 1581, nómina y ley laboral, calidad móvil) hasta que ninguno encontró algo que impida venderla. Detalle en REVISION.md.
- Kiosco con sesión propia por centro, que solo se apaga con la clave de un supervisor.
- Préstamos con autorización firmada y tope legal automático; liquidación de contrato completa (indemnización art. 64, base 360, jornaleros, registro e impresión para firma).
- Bandeja sin señal por persona: en un celular compartido nadie envía ni ve marcaciones de otro.
- Módulos nuevos con pantalla propia: tablero en vivo, modo kiosco para tablet de portería, QR rotativo por obra,
  préstamos y anticipos, banco de compensatorios, comunicados con confirmación de lectura, presupuesto por obra,
  provisiones de prestaciones, liquidación de contrato, expediente por persona y traslado masivo entre obras.
- Autoservicio del trabajador (pestaña «Más»): mi horario, comunicados, préstamos y compensatorios, mis extras,
  reportar incapacidad, certificado laboral imprimible y verificable en línea, contactos de emergencia y cerrar
  todas las sesiones. Acuse de recibo de desprendibles.
- Seguridad: polígono de obra, precisión mínima de GPS, foto obligatoria en marcaciones dudosas, celular
  vinculado por cuenta, código por correo para administradores (2FA), sesión de administrador de 24 h,
  auditoría encadenada con verificación, supresión de datos personales.
- Alertas agrupadas por hora y alertas opcionales por Telegram.
- Licencia por planes (básico, profesional, empresa). Al vencer, el panel queda en modo consulta; los
  trabajadores siguen marcando con normalidad.
- Correcciones sobre la versión del aliado: el archivo histórico ya no lo borra la rotación de copias; permiso
  de conexión externa para Telegram; la liquidación usa el promedio del último año cuando el salario es variable
  y no descuenta préstamos sin autorización escrita; el certificado tiene página pública de verificación; se
  restauró la validación del orden de las marcaciones; página y demo reconstruidas en 1.7.0.

## 1.2.0 — 2026-11-17
- Informes versátiles: cualquier rango de hasta 90 días; agrupar por persona, centro, cargo, día, semana, mes,
  día de la semana o total; filtros por centro, cargo y persona; 20 medidas a elegir (horas, extras, nocturnas,
  dominicales, tardanzas, ausencias, ausentismo, permisos, incapacidades, marcaciones digitadas o fuera de zona,
  costo); gráfica y tabla con totales; seis informes listos; informes guardados; descarga a Excel y CSV.
- El costo por obra ahora se reparte según las horas trabajadas en cada obra, y se puede sumar un factor
  prestacional (Configuración → Reglas). Los supervisores ven los informes de su gente sin costos.
- El trabajador consulta sus jornadas, horas, extras, tardanzas y neto estimado por semana, mes o periodo.

## 1.1.0 — 2026-11-17
- Instalación desde plantilla: el cliente copia una hoja, usa «Instalar», publica y recibe el enlace de su
  empresa. Una sola página para todos los clientes; cada celular se conecta con el enlace de su empresa.
- Rol de supervisor por obra, turnos rotativos con programación por fechas, recuperar contraseña por correo.
- Bonos, auxilios y descuentos; extras en lote; permisos registrados por RRHH; datos bancarios; fecha de retiro.
- Primeros pasos en el panel. Correcciones de seguridad, nómina y uso sin señal: ver REVISION.md.

## 1.0.1 — 2026-11-15
- Corregido: tras crear la cuenta la aplicación se quedaba en «Actualizamos las políticas». Google Sheets
  convertía la versión «2026-11» en fecha; ahora todo valor se guarda como texto literal.
- Nuevo: control de fatiga (alerta al acercarse al máximo de horas continuas, configurable en Alertas).
- Nuevo: archivos planos CSV por nómina cerrada (conceptos con códigos contables configurables, y pagos).
- Las hojas técnicas (Sesiones, Auditoria, Errores) quedan ocultas al instalar.

## 1.0.0 — 2026-11-15
- Primera versión: marcación con GPS y foto al azar, olvido de marcación, permisos con firma de jefes
  y envío por WhatsApp, incapacidades, horas extra con aprobación, nómina estimada y desprendibles,
  resumen por obra, exportación a Excel, alertas por correo, configuración por empresa, páginas
  legales, copias de seguridad, retención automática y monitoreo.
