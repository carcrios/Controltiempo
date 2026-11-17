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
