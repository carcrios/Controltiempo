# Manual de uso: Control de jornada

Este manual explica **cómo funciona la aplicación en el día a día** para cada tipo de usuario: **Trabajador**, **Supervisor/Jefe**, **Administrador (RRHH)** y **Proveedor**.

---

## 1. ¿Cómo funciona para el Trabajador? (desde el celular)

### Marcar jornada (Entrada, Almuerzo y Salida)
1. Abre la aplicación instalada en tu celular.
2. Toca el botón principal (**Marcar Entrada**, **Salida a almuerzo**, **Regreso de almuerzo** o **Marcar Salida**).
3. La app toma tu **ubicación GPS** automáticamente:
   * Si el centro exige **QR dinámico o código del día**, te pedirá escanear el QR de portería o escribir el código que entregó el supervisor.
   * Si sale foto aleatoria (o estás fuera de zona / con señal GPS débil), se abrirá la cámara para tomar una foto de verificación.
4. **¿Qué pasa si no hay internet en la obra?**
   Marca igual: el registro (con hora corregida, GPS y foto) se guarda en tu celular y se envía automáticamente apenas vuelvas a tener señal.
5. **¿Se te olvidó marcar?**
   Usa la opción **Se me olvidó marcar**, escribe la hora y el motivo. Ese registro queda en revisión para que el administrador lo valide.

### Qué más puede ver y hacer el trabajador
* **Mi horario (`miProgramacion`):** ver qué turno, obra, festivo, descanso, permiso o incapacidad tiene en los próximos 14 días.
* **Permisos:** solicitar permisos o vacaciones, adjuntar soporte y enviar el enlace de firma por WhatsApp a su jefe.
* **Incapacidades (`incapacidadReportar`):** subir la foto de su incapacidad médica con fechas para que RRHH la valide.
* **Desprendibles de pago:** consultar sus quincenas/meses cerrados y tocar **Confirmar recibido** (acuse de recibo).
* **Horas extra, préstamos y compensatorios:** consultar sus horas extra aprobadas/pendientes, el saldo de sus préstamos/cuotas y su banco de horas compensatorias.
* **Certificado laboral:** generar su carta laboral (con o sin salario) con código de verificación en 1 clic.
* **Comunicados y emergencias:** leer circulares de la empresa (con confirmación de lectura) y consultar en 1 toque su ARL, EPS y teléfonos de emergencia.
* **Seguridad de su cuenta:** cambiar contraseña o cerrar sesión en todos sus dispositivos.

---

## 2. ¿Cómo funciona para el Supervisor / Jefe?

* **Firmar permisos desde WhatsApp:** cuando un trabajador pide permiso, al jefe le llega un enlace. Al abrirlo, ingresa su **clave de firma (PIN de 6–8 dígitos)** y aprueba o rechaza.
* **Vista en vivo («Quién está en obra ahora»):** ve en tiempo real quién ya entró, quién está en almuerzo, quién ya salió, quién no ha llegado y cuántas horas lleva cada persona de sus centros asignados.
* **QR dinámico / Código del día:** puede mostrar en una tablet el QR que rota cada 60 segundos o ver el código diario para dárselo al personal presente en obra.
* **Modo Kiosco:** si hay una tablet compartida en portería, el supervisor la deja abierta para que los trabajadores sin celular marquen con su cédula, clave y foto.
* **Aprobar horas extra:** revisa las horas extra de su equipo y decide si se **aprueban para pago**, se **rechazan** o se **abonan al banco de compensatorios**.

---

## 3. ¿Cómo funciona para el Administrador / RRHH?

### Gestión diaria
* **Personal:** crear trabajadores, importarlos desde Excel, enviarles su enlace por WhatsApp, registrar tipo y fecha de vencimiento de contrato (la app avisa 35 días antes), trasladar grupos entre obras, liberar dispositivos bloqueados o anonimizar exempleados (Ley 1581).
* **Centros de trabajo / Obras:** configurar ubicación en mapa, geocerca circular o por **polígono**, horario por día, si exige QR y **presupuesto de horas y costo** (alerta automática al 80 % y 100 %).
* **Turnos:** crear turnos rotativos y programarlos por rango de fechas.
* **Marcaciones:** revisar tardanzas, fotos, alertas de GPS sospechoso y corregir o anular registros (todo queda en auditoría).

### Nómina, finanzas y analítica
* **Novedades y Préstamos:** registrar bonos, auxilios, descuentos y préstamos en cuotas. Al **cerrar la nómina**, las cuotas de préstamos activos se descuentan automáticamente.
* **Cierre de nómina:** calcula salario, recargos nocturnos, dominicales/festivos, horas extra aprobadas, auxilio de transporte, salud, pensión y fondo de solidaridad bajo normativa colombiana. Un periodo cerrado queda inmutable y genera el desprendible de cada trabajador.
* **Provisiones y Liquidación de contrato:** calcula las provisiones de prestaciones sociales (prima, cesantías, intereses y vacaciones) y permite simular la liquidación final al retirar a un empleado.
* **Informes y Tablero 360°:** exportar a Excel/CSV y consultar el **Expediente 360°** de cualquier trabajador o el **Tablero gerencial 360°** de toda la empresa.

### Seguridad y respaldos
* **Alertas:** configurables por correo (inmediatas o agrupadas cada hora) y por **Telegram** (gratis e ilimitado).
* **Copias de seguridad:** automáticas cada 7 días en Google Drive (se conservan las últimas 8).
* **Auditoría íntegra:** cada cambio queda encadenado con hash criptográfico para detectar manipulaciones manuales en Sheets.

---

## 4. ¿Cómo funciona para ti como Proveedor? (Planes y Cobro)

Desde tu hoja privada con `PanelProveedor.gs` controlas a todos tus clientes:

| Plan | Tope usuarios | Módulos incluidos |
|---|---|---|
| **Básico** | 25 | Control de asistencia, GPS, fotos, horarios y exportación. |
| **Profesional** | 80 | Todo lo de Básico + Nómina, Permisos, Turnos, Préstamos, Compensatorios, Certificado laboral y Comunicados. |
| **Empresa** | 150 | Todo lo de Profesional + Modo Kiosco, QR dinámico, Polígonos, Presupuesto por obra, Tablero/Expediente 360° y Seguridad Pro (2FA, bloqueo de dispositivo, auditoría encadenada). |

* **Si un cliente paga o renueva:** en tu hoja `Clientes`, seleccionas su fila → **Panel de Proveedor → 3. Renovar cliente (+30 días)** → le envías la nueva llave por WhatsApp.
* **Si un cliente deja de pagar:** al pasar la fecha de vencimiento, la aplicación **se bloquea automáticamente** y solo permite al administrador ingresar para pegar la nueva llave de renovación.
