# Especificación de producto — Sistema de gestión de turnos con reasignación automática

## 1. Resumen

Sistema de gestión de turnos para profesionales independientes en rubros con alta tasa de ausentismo (salud, estética, psicología, nutrición, clínica, etc.). Los turnos se sacan por WhatsApp o por web. El diferencial del producto es un motor que, ante cada cancelación, avisa automáticamente a pacientes en lista de espera para reasignar el cupo antes de que se pierda.

## 2. Modelo de negocio

- **Suscripción mensual**, escalada por cantidad de profesionales en la cuenta.
- **Comisión fija por turno reasignado** (no se cobra comisión por turnos agendados de forma normal). Esto requiere loguear explícitamente el origen de cada turno para poder facturar.
- **MVP sin gestión de pagos**: no hay seña, no hay link de pago, no hay reembolsos. Se deja explícitamente fuera de alcance (ver sección 10).

## 3. Actores y roles

- **Cuenta**: entidad de facturación. Puede tener uno o varios profesionales.
- **Profesional**: pertenece a una cuenta. Carga su disponibilidad horaria, ve su agenda, puede cancelar turnos. Tiene su propio calendario de Google sincronizado.
- **Paciente**: se registra vía un link web (no hay registro dentro del chat de WhatsApp). Puede sacar turno con distintos profesionales de distintas cuentas en la plataforma (el paciente es una identidad global, no atada a una sola cuenta). Puede cancelar sus propios turnos. Puede anotarse en lista de espera.
- **Motor de reasignación**: proceso automático (no es un rol humano) que gestiona la notificación de cupos liberados.

## 4. Alcance del MVP

**Incluido:**
- Agenda de turnos por WhatsApp (menú guiado con botones) y por web.
- Carga de disponibilidad horaria y vista de agenda para el profesional.
- Motor de reasignación de turnos cancelados con lista de espera.
- Sincronización con Google Calendar.
- Recordatorio de asistencia 48 hs antes del turno, con auto-cancelación si no hay confirmación.
- Registro de pacientes vía link web.

**Explícitamente fuera del MVP:** ver sección 10.

## 5. Flujos funcionales

### 5.1 Agenda de turno vía WhatsApp

1. El paciente escribe al número único de la cuenta (un solo número por cuenta, no uno por profesional).
2. Si el número no está registrado, el bot responde con un link de registro web. El flujo se retoma una vez completado el registro.
3. Si está registrado, el bot pregunta con qué profesional quiere el turno (menú de botones).
4. El bot muestra franjas disponibles según la disponibilidad cargada por ese profesional y el tipo de servicio elegido (la duración depende del servicio).
5. Confirmación del turno → se sincroniza con el Google Calendar del profesional.

### 5.2 Agenda de turno vía web

Mismo flujo que 5.1 pero desde una interfaz web, sin pasar por WhatsApp. Un paciente puede usar ambos canales indistintamente.

### 5.3 Cancelación de turno

- Puede cancelar el **profesional** o el **paciente**.
- Toda cancelación dispara el motor de reasignación (sección 6), sin excepción — incluyendo cancelaciones automáticas por falta de confirmación (5.4) y liberaciones por adelantamiento de turno (6.6).

### 5.4 Recordatorio y confirmación de asistencia

- 48 hs antes del turno, se envía un recordatorio por WhatsApp pidiendo confirmar asistencia.
- Si el paciente no responde dentro de las 24 hs siguientes (es decir, para el momento en que faltan 24 hs para el turno), el turno se cancela automáticamente.
- El mensaje del recordatorio debe indicar explícitamente esta condición ("si no confirmás antes de [hora], tu turno se cancela automáticamente").
- La cancelación automática entra al motor de reasignación igual que cualquier otra.

## 6. Motor de reasignación de turnos cancelados (el diferencial del producto)

### 6.1 Disparador
Cualquier cancelación de turno — manual (profesional o paciente) o automática (5.4, o 6.6).

### 6.2 Lista de espera
- El paciente se anota de forma explícita (opt-in), no es automático.
- Puede elegir días específicos de preferencia.
- Puede activar la opción **"notificarme si se libera un turno antes"** sobre un turno que ya tiene agendado, indicando qué otro día preferiría.

### 6.3 Prioridad de notificación
1. Pacientes en lista de espera **sin turno agendado**.
2. Pacientes con turno agendado que pidieron adelantarlo ("notificarme si se libera antes").

Dentro de cada grupo: orden de inscripción (FIFO) como default — pendiente de validar si se necesita otro criterio (ver sección 11).

### 6.4 El turno se abre a todos desde el momento cero
No hay reserva exclusiva para el candidato prioritario. El turno queda disponible para reserva por cualquier canal (WhatsApp o web) desde el instante en que se libera. La prioridad se traduce en **quién es notificado primero**, no en exclusividad de acceso.

**Consecuencia técnica:** la confirmación tiene que resolverse con un mecanismo atómico de "primero en confirmar gana" (ej. update condicional a nivel de base de datos), válido para cualquier canal por igual. No existen "ventanas reservadas": si dos personas confirman casi al mismo tiempo, gana la primera que efectivamente impacta en la base, y a la otra se le informa que el turno ya no está disponible.

### 6.5 Ritmo de notificación dentro de la lista de espera

Estos tiempos regulan cuándo se notifica al siguiente candidato de la lista (para evitar mandar WhatsApp a toda la lista de espera por cada cancelación) — **no** son ventanas de reserva exclusiva.

| Tiempo hasta el turno | Modo | Intervalo entre notificaciones |
|---|---|---|
| Más de 7 días | Secuencial | 12–24 hs |
| 2–7 días | Secuencial | 3–6 hs |
| 24–48 hs | Secuencial | 1–2 hs |
| 4–24 hs | Secuencial | 30 min |
| 1–4 hs | Secuencial | 10–15 min |
| Menos de 1 h | **Broadcast simultáneo** a varios candidatos | Piso mínimo 10 min |

- Piso mínimo absoluto: 10 minutos.
- El cálculo del tiempo restante se hace en el momento de enviar cada notificación, no en el momento de la cancelación (para que una cancelación de madrugada recalcule correctamente al llegar el horario de contacto).

### 6.6 Horario de contacto
Las notificaciones del motor de reasignación solo se envían entre las **7:00 y las 22:00**. Si un turno se libera fuera de ese rango, la notificación se reprograma para las 7:00, recalculando en ese momento el tiempo real restante hasta el turno (lo que puede implicar pasar directo a modo broadcast si queda poco tiempo).

### 6.7 Adelantamiento de turno (waitlist con turno propio)
Si un paciente con la opción "notificarme si se libera antes" confirma un turno más temprano, su turno original se cancela automáticamente y ese cupo vuelve a entrar al motor de reasignación (flujo recursivo).

### 6.8 Registro para facturación
Cada turno debe quedar marcado con su origen (`normal` vs. `reasignado_por_motor`), porque de ahí sale la comisión fija por turno reasignado.

## 7. Modelo de datos (entidades principales)

- **Account**: cuenta que agrupa profesionales, plan de suscripción.
- **Professional**: pertenece a una Account. Referencia a su calendario de Google.
- **ServiceType**: tipo de servicio por profesional, con duración en minutos.
- **AvailabilitySlot**: disponibilidad horaria cargada por el profesional (recurrente o puntual).
- **Patient**: identidad global (no atada a una sola Account). Teléfono, nombre, fecha de registro. Sin datos clínicos.
- **Appointment**: turno. Profesional, paciente, servicio, horario, estado (agendado / confirmado / cancelado / completado), canal de origen (whatsapp / web / motor de reasignación), referencia a un turno original si aplica (caso 6.7).
- **WaitlistEntry**: inscripción a lista de espera. Paciente, profesional, días preferidos, si tiene o no turno propio asociado (define el grupo de prioridad 6.3), estado (activa / cumplida / expirada).
- **NotificationLog**: registro de cada notificación enviada por el motor — turno, paciente, canal, momento de envío, ventana calculada, respuesta y momento de respuesta.
- **ReassignmentEvent**: registro de cada reasignación exitosa, usado para el cálculo de la comisión fija.

## 8. Integraciones

### 8.1 WhatsApp — Kapso
- Un único número por cuenta; el bot pregunta con qué profesional se quiere el turno.
- Menú guiado con botones / WhatsApp Flows (no conversación libre en el MVP).
- Webhooks entrantes para mensajes, respuestas de botones y confirmaciones del motor de reasignación.

### 8.2 Google Calendar
- OAuth2 por profesional.
- Sincronización al confirmar, cancelar o reasignar un turno, para evitar doble reserva.

## 9. Stack técnico

- **Backend**: NestJS (Node.js + TypeScript)
- **Base de datos**: PostgreSQL
- **Colas / jobs**: Redis + BullMQ (notificaciones programadas del motor de reasignación)
- **Frontend web**: Next.js + React
- **WhatsApp**: Kapso (API + webhooks + Flows)
- **Calendario**: Google Calendar API

## 10. Fuera de alcance del MVP (explícito)

- Cualquier procesamiento de pagos: sin seña, sin link de pago, sin reembolsos.
- Datos clínicos o historia clínica — el sistema guarda únicamente datos administrativos del turno (nombre, teléfono, horario, profesional, servicio).
- Conversación libre por WhatsApp (se usa menú guiado, no un agente conversacional abierto).
- Reserva exclusiva para candidatos de lista de espera (el diseño es "notificación con ventaja de tiempo", no reserva garantizada — ver 6.4).

## 11. Decisiones pendientes / asunciones a validar

Estos puntos no se definieron explícitamente en el proceso de producto y quedaron como asunciones razonables para poder avanzar con la construcción. Conviene revisarlos antes o durante el desarrollo:

- **Autenticación**: método de login para profesionales/cuentas (email + contraseña, magic link, etc.) no fue definido.
- **Orden dentro de cada grupo de prioridad de la lista de espera**: se asume FIFO (orden de inscripción) por defecto.
- **Zona horaria**: se asume una única zona horaria por cuenta.
- **Definición de "servicio"**: quién carga los tipos de servicio y sus duraciones — se asume que lo hace cada profesional.
- **Permisos dentro de una cuenta multi-profesional**: si hay un rol de administrador de cuenta distinto del profesional individual.
