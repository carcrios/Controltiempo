# Revisión por agentes — 16 y 17 de noviembre de 2026

Cuatro revisores independientes leyeron el código y probaron ataques y cálculos contra el simulador.
Las pruebas automáticas pasaron de 86 a 109 para cubrir lo corregido.

## Corregido en la versión 1.1.0
| Revisor | Hallazgo |
|---|---|
| Seguridad | Jornadas falsificadas: fecha libre en «Se me olvidó» y marcaciones viejas enviadas como «sin señal» (ahora van a revisión y bloquean el cierre de nómina) |
| Seguridad | Adivinar la clave de firma creando muchos permisos: bloqueo por jefe tras 5 fallos, aviso al jefe, clave de 6 dígitos |
| Seguridad | Rociado de contraseñas y adivinar el código de empresa: contador global de fallos, alerta, código alfanumérico de 8 |
| Seguridad | Bloquear la cuenta de otro: ahora solo cuentan los fallos |
| Seguridad | Contraseñas triviales; cambiar la clave no cerraba las otras sesiones |
| Seguridad | GPS en los correos de alerta; Alertas y Errores no caducaban |
| Seguridad | Cuenta pendiente veía los centros de la empresa; radio de GPS ampliable hasta 100 m (ahora 50) |
| Calidad móvil | Sin señal en la mañana mostraba la jornada de ayer y no dejaba marcar |
| Calidad móvil | Marcaciones pendientes se perdían al caducar la sesión o al enviarse dos veces a la vez |
| Calidad móvil | Las rechazadas desaparecían en 14 s; ahora quedan en pantalla con «Registrarla ahora» |
| Calidad móvil | Hora del celular mal puesta: se corrige con la del servidor |
| Calidad móvil | Reintento automático cada 45 s; volver a la app ya no «desmarca» |
| Calidad móvil | La app no abría sin señal en la primera visita; quedaba en blanco con señal débil |
| Calidad móvil | Celulares atrapados en versiones viejas: aviso «Actualizar» |
| Calidad móvil | Instrucciones de permisos para app instalada y iPhone; GPS bajo techo con segundo intento |
| Calidad móvil | Una falla técnica de la cámara se reportaba como bloqueo |
| Nómina y ley | Pago por día: sin descanso dominical remunerado, sin incapacidad ni vacaciones |
| Nómina y ley | Sábado no programado sin pagar; horarios de más de 9 h sin extras |
| Nómina y ley | Domingo habitual liquidado como ocasional (pagaba de más) |
| Nómina y ley | Fondo de solidaridad por salario y no por IBC, sin tramos; sin tope de 25 SMMLV |
| Nómina y ley | Sin fecha de retiro; incapacidad de más de 90 días al 66,67 %; día 31 |
| Nómina y ley | Permiso por horas sin asistir no era ausencia; licencias pagaban auxilio de transporte |
| Nómina y ley | Día de la familia y de la bicicleta pasaron a «por acuerdo»; dominical no causado configurable |
| Comprador | Bonos, auxilios y descuentos (novedades de pago), y ajustes de periodos cerrados |
| Comprador | Aprobar horas extra en lote; RRHH registra permisos y vacaciones a nombre del trabajador |
| Comprador | Importar de nuevo actualiza a quien ya existe; datos bancarios en el plano de pagos |
| Comprador | Saldos de vacaciones y ausentismo de toda la empresa en el Excel |

## Pendiente (no resuelto todavía)
- **Comprador:** atar la cuenta a un celular y comparar la foto con una de referencia; editar una
  incapacidad (hoy se elimina y se crea de nuevo); traslados masivos entre obras con fecha; costo por
  obra prorrateado con factor prestacional; resumen de alertas por hora en lugar de un correo por evento;
  tipo de contrato y vencimiento; constancia de recibido del desprendible.
- **Seguridad:** el hash de contraseñas (150 rondas de SHA-256) es débil frente a un robo de la hoja;
  los soportes de permisos e incapacidades no caducan; no hay supresión de exempleados a solicitud.
- **Nómina:** con un centro sin horario no se detectan ausencias; extras sin aprobar en un domingo
  ocasional no se pagan (discutible).
- **Calidad móvil:** las pantallas del administrador aún leen hojas completas; con más de 150 personas
  conviene un índice por fecha.

## Revisión 2026-11-20 — versión 1.7.0 (unión con la versión del aliado)

Corregido en esta versión: archivo histórico borrado por la rotación de copias, falta del permiso para Telegram,
regresión del orden de marcaciones, base de liquidación con salario variable, préstamos descontados sin
autorización en la liquidación, certificado sin verificación, licencia que bloqueaba a los trabajadores,
página y demo desactualizadas.

### Pendiente — bloquea la venta
1. «Salir del kiosco» abre el panel con la sesión del supervisor sin pedir clave (se pueden aprobar extras propias).
2. Kiosco: permite saber si la contraseña de cualquier persona, incluso del administrador, es correcta; sin bloqueo por intentos.
3. Préstamos: la cuota no tiene tope y deja el neto negativo; no guarda la autorización escrita; marca cuotas pagadas a retirados sin descontarlas; se puede aplicar dos veces.
4. Banco de compensatorios: abona 1:1 sin recargo, admite doble abono y saldo negativo; el día compensatorio se descuenta como ausencia.
5. Suprimir datos (Ley 1581) deja incapacidades, GPS, auditoría, salario y el histórico; el histórico conserva GPS para siempre.
6. 2FA de administradores se salta con «recuperar contraseña» o con un administrador sin correo; la recuperación guarda el hash viejo.
7. Pago por día: el domingo o festivo trabajado paga solo el recargo y pierde el descanso.

### Pendiente — importante
8. Liquidación de contrato: sin indemnización (arts. 64 y 65), días calendario en vez de 360, vacaciones sobre el básico, vacaciones a 15/365.
9. Vinculación de celular eludible sin identificador y bloqueo sin salida en iPhone; supervisor ve banco y salario en el expediente.
10. Marcación sin señal en obra con QR siempre rechazada; bandeja envía fuera de orden; posible pérdida si IndexedDB falla; bandeja vacía al arrancar.
11. Código del día del QR válido 24 h (se comparte por WhatsApp); kiosco inutilizable en obras con QR y bloqueado con licencia vencida.
12. Cadena de auditoría burlable borrando hashes; verificación de certificados bloqueable por cualquiera y sin salario.
13. Provisiones y presupuesto sin aportes del empleador y con bases mal filtradas.
14. Licencia compartible entre empresas y activable con la clave del proveedor vacía.

### Pendiente — deseable
15. Hora pico con 150 personas: bloqueo único y foto subida dentro del bloqueo; Telegram enviado dentro del bloqueo.
16. Telegram sin opción de enviar sin nombres; comunicados sin aviso al trabajador; reenviar código 2FA; caché del service worker con nombre fijo; periodo de gracia de licencia; certificado emitido por RRHH para retirados.

### Corregido el 2026-11-20 (segunda pasada, antes de vender)
- Kiosco con sesión propia que solo marca en un centro; para salir hay que ingresar de nuevo. Mismo error para clave mala, otra obra o administrador; cuenta en el bloqueo global. Funciona en obras con QR y con licencia vencida. Borra los datos a los 30 s y conserva la cédula si falla la red.
- Préstamos: autorización firmada obligatoria; cuotas automáticas al cerrar (una por periodo), solo a quien se liquida, con tope de mínimo vital y 50 % del neto; el saldo sigue al periodo siguiente. Sin descuento manual.
- Compensatorios: abono con recargo, sin duplicar al redecidir, acuerdo escrito obligatorio, sin saldo negativo; el disfrute se paga como permiso remunerado.
- Jornalero: el domingo o festivo trabajado conserva el descanso remunerado.
- Recuperar contraseña ya no entrega sesión (pasa por 2FA y celular vinculado) y usa el hash v2. 2FA no se activa con administradores sin correo; botón para reenviar código.
- Supresión: borra GPS, fotos, soportes y notas de salud, salario y datos de contacto; conserva lo que exige la ley laboral. El histórico se guarda sin GPS ni fotos.
- Liquidación: meses de 30 días, días no remunerados descontados, base promedio de año (cesantías), semestre (prima) y sin extras (vacaciones), indemnización art. 64 por tipo de contrato, salario pendiente, avisos de art. 65 y cesantías, registro e impresión para firma. Vacaciones a 15/360.
- QR: el código del día solo dentro de la geocerca; sin señal vale el QR de la hora de la marca; el QR se pide antes de guardar sin señal; olvidos de menos de 15 min piden QR.
- Bandeja: copia en IndexedDB y en localStorage (sin foto), envío en orden deteniéndose en el primer fallo, aviso si no se pudo guardar, reintento de rechazadas con su foto.
- Celular vinculado: sin identificador no entra; el administrador recibe el aviso. El supervisor no ve salario, cuenta ni préstamos en el expediente.
- Auditoría anclada fuera de la hoja (total y último eslabón): borrar firmas o filas se detecta.
- Certificados guardados tal como se emitieron, con salario verificable; límite por cédula; RRHH los emite para retirados.
- Provisiones con aportes del empleador (pensión, ARL, caja y, sin exoneración, salud, SENA, ICBF) y bases correctas; el presupuesto por obra usa el costo real.
- Licencia atada al NIT, con vencimiento obligatorio y 15 días de gracia; sin clave de proveedor no se activan llaves. Herramienta `herramientas/llave-licencia.js`.
- Telegram sale fuera del bloqueo, sin nombres por defecto, y recibe el resumen agrupado.
- Caché del service worker con la versión.

### Corregido el 2026-11-20 (tercera pasada, tras la segunda ronda de revisores)
- Jornaleros: la liquidación usa el jornal × 30; el certificado indica salario diario.
- Kiosco: solo marca a personas asignadas a ese centro; se apaga únicamente con cédula y clave de un supervisor del centro o un administrador; la sesión cae si el centro se desactiva o sale del alcance del supervisor; no se activa con marcaciones propias pendientes.
- Bandeja: cada marcación lleva la cédula y solo la envía su dueño; IndexedDB con tiempo límite y sin bloqueo; borrados recordados para que no reaparezcan; hasta 50 rechazadas; reintento sin doble toque y a la bandeja si no hay señal.
- Seguridad: el contador global de fallos solo alerta (nadie puede bloquear el ingreso de todos); límites por cédula y por tablet; un certificado auténtico siempre se verifica; con celular vinculado no se entra sin identificador y al vincular se cierran otras sesiones; QR presentado sin señal con más de 30 min de atraso queda sospechoso; NIT de la licencia fijado al activarla.
- Datos: la supresión limpia alertas, errores y el histórico; las alertas y Telegram ya no copian motivos; el histórico guarda los motivos como "[motivo no archivado]".
- Nómina: horas extra a compensatorio apagado por defecto (concepto MinTrabajo 36107) y con advertencia; no se puede cambiar una decisión ya disfrutada; base de vacaciones sin dominicales/festivos; sábado hábil si la persona trabaja sábados; ARL sin días de incapacidad ni vacaciones; exoneración evaluada sobre lo devengado; disfrute de compensatorio contra la jornada real del día; liquidación registrada excluye a la persona del cierre de ese periodo y salda el préstamo; descuento final solo de préstamos autorizados, sin tocar cesantías ni más de la mitad del salario; prima ya pagada y aviso de intereses en enero; ARL por obra y costo por obra con su propia carga.

### Corregido el 2026-11-20 (cuarta pasada)
- Bandeja por persona: `bandeja.mias(cedula)` para pantalla, contador, envío y reintentos; las rechazadas solo las ve su dueño; las marcaciones sin dueño (versiones anteriores) no se envían solas; el servidor rechaza con AJENA una marcación cuya cédula no es la de la sesión; la foto se lee de IndexedDB antes de enviar y, si no se puede, se espera en vez de enviarla sin foto; `cj.kiosco` se limpia al entrar como usuario normal; el kiosco se puede activar aunque haya marcaciones ajenas (se conservan).
- Liquidación: solo se registra con retiro de hoy o antes, una vez por persona; la persona queda inactiva y sale solo del cierre del periodo de su retiro; prima pagada hasta una fecha; préstamos solo a personas activas; la casilla de descuento exige que la autorización cubra prestaciones.
- Extras a compensatorio exige la foto del acuerdo. Exoneración de aportes apagada por defecto. El bloqueo de una tablet no impide que el supervisor la apague.
- Pendiente conocido, no bloqueante: bloqueo de una cédula concreta por 8 intentos fallidos durante 15 min; sábado hábil por centro y no por persona; la llave de licencia depende del NIT configurado (la protección real es contractual).
