# Contexto del proyecto — Asissto

Sistema de gestión de turnos con reasignación automática. Ver [`especificacion-producto.md`](./especificacion-producto.md) para el detalle de producto y [`README.md`](./README.md) para la lista de endpoints.

Este archivo es la referencia rápida: cómo se corre, qué credenciales hacen falta y qué falta construir.

---

## 1. Cómo ejecutarla

### Requisitos previos

- Node.js 20+
- pnpm 9+ (`npm install -g pnpm`)
- Docker + Docker Compose

### Primera vez

```bash
# 1. Clonar y entrar al repo
cd asissto

# 2. Variables de entorno (para dev alcanza con los defaults)
cp .env.example .env

# 3. Levantar Postgres + Redis
pnpm docker:up

# 4. Instalar dependencias
pnpm install

# 5. Generar cliente de Prisma y correr la primera migración
pnpm db:generate
cd apps/api && pnpm prisma migrate dev --name init && cd ../..

# 6. Levantar la API en modo dev (hot reload)
pnpm api:dev
```

La API queda en `http://localhost:3001/api`.

### Ciclo diario

```bash
pnpm docker:up      # si los contenedores no están arriba
pnpm api:dev
```

### Después de cambiar `schema.prisma`

```bash
cd apps/api
pnpm prisma migrate dev --name <nombre-descriptivo>
```

Prisma regenera el client automáticamente.

### Ver / editar la base

```bash
pnpm db:studio      # abre Prisma Studio en http://localhost:5555
```

### Probar el flujo básico end-to-end

```bash
# 1. Crear cuenta + owner
curl -X POST http://localhost:3001/api/auth/signup-owner \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@test.com","password":"password123","fullName":"Ana","accountName":"Consultorio Ana"}'
# → devuelve accessToken

# 2. Con ese token, crear un profesional
TOKEN=<pega-el-accessToken>
curl -X POST http://localhost:3001/api/professionals \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"displayName":"Dra. Ana","email":"ana@test.com","password":"password123","fullName":"Ana Pérez"}'

# 3. Registrar un paciente (endpoint público)
curl -X POST http://localhost:3001/api/patients/register \
  -H "Content-Type: application/json" \
  -d '{"phone":"+5491111111111","fullName":"Juan Paciente"}'

# 4. Pedir OTP simulado — el código se loguea en la consola de la API
curl -X POST http://localhost:3001/api/auth/patient/otp/request \
  -H "Content-Type: application/json" \
  -d '{"phone":"+5491111111111"}'
# En consola vas a ver: [OTP SIMULATED] patient=+5491111111111 code=000000
# (000000 porque OTP_DEV_CODE=000000 en .env.example)

# 5. Verificar OTP
curl -X POST http://localhost:3001/api/auth/patient/otp/verify \
  -H "Content-Type: application/json" \
  -d '{"phone":"+5491111111111","code":"000000"}'
```

---

## 2. API keys y credenciales — qué poner y dónde

Todas las credenciales van en el archivo `.env` en la raíz del repo (copiar desde `.env.example`). **Nunca commitear `.env`.**

### En fase 1 (ahora) — no necesitás ninguna API key externa

Los defaults de `.env.example` alcanzan para correr todo en local. Los únicos valores que conviene cambiar:

| Variable | Cuándo cambiar |
|---|---|
| `JWT_SECRET` | Antes de cualquier deploy. En dev el default está bien. |
| `OTP_DEV_CODE` | Si querés otro código fijo para los OTP simulados. Default `000000`. |

### En fase 4 — integraciones externas

Cuando llegue el momento de integrar WhatsApp y Google Calendar, hay que llenar estos bloques del `.env`:

#### Kapso (WhatsApp)

```env
OTP_SIMULATED=false                    # apaga el canal simulado
KAPSO_API_KEY=<key del dashboard de Kapso>
KAPSO_WEBHOOK_SECRET=<secret compartido con Kapso para validar webhooks entrantes>
```

**Dónde conseguirlas:**
1. Crear cuenta en Kapso.
2. Dar de alta un número de WhatsApp Business (esto lleva verificación de Meta, puede tardar días).
3. En el dashboard de Kapso → API keys → generar una key con permisos de envío + webhooks.
4. Configurar la URL de webhook apuntando a `https://<tu-dominio>/api/integrations/kapso/webhook` (endpoint que se crea en fase 4).
5. El `KAPSO_WEBHOOK_SECRET` lo definís vos y lo pegás en ambos lados (Kapso y `.env`).

**Además**: cada cuenta debe tener su propio número de WhatsApp (sec 5.1). El número se guarda en `Account.whatsappNumber` (endpoint `PATCH /api/accounts/me`), no en `.env`.

#### Google Calendar

```env
GOOGLE_CLIENT_ID=<client id de OAuth 2.0>
GOOGLE_CLIENT_SECRET=<client secret>
GOOGLE_REDIRECT_URI=http://localhost:3001/api/integrations/google/callback
```

**Dónde conseguirlas:**
1. Ir a [Google Cloud Console](https://console.cloud.google.com/).
2. Crear proyecto → APIs & Services → Enable API → **Google Calendar API**.
3. OAuth consent screen → configurar como "External", agregar el scope `https://www.googleapis.com/auth/calendar`.
4. Credentials → Create Credentials → OAuth client ID → tipo "Web application".
5. Agregar `http://localhost:3001/api/integrations/google/callback` (dev) y la URL de producción como Authorized redirect URIs.
6. Copiar Client ID + Client Secret al `.env`.

En prod hay que actualizar `GOOGLE_REDIRECT_URI` al dominio real y volver a agregarlo en la consola de Google.

El **refresh token de cada profesional** se guarda en `Professional.googleRefreshToken` (encriptado — falta implementar el vault/cifrado en fase 4). No va en `.env`.

### Base de datos y Redis

En dev usan credenciales fijas del `docker-compose.yml` (`asissto/asissto`). En prod:

```env
DATABASE_URL=postgresql://<user>:<pass>@<host>:5432/<db>?schema=public&sslmode=require
REDIS_HOST=<host>
REDIS_PORT=6379
# REDIS_PASSWORD=<pass>   # agregar esta variable si el Redis prod requiere auth
```

---

## 3. Qué falta

### Fase 2 — Agenda + panel web (próximo)

- [ ] Cálculo de slots disponibles a partir de `AvailabilitySlot` + `ServiceType.duration` + turnos existentes, en la TZ de la cuenta.
- [ ] Validación de overlap al crear turno (que no pise otro `SCHEDULED`/`CONFIRMED` del mismo profesional).
- [ ] Validación de que el turno cae dentro de un `AvailabilitySlot` válido.
- [ ] Cancelación real: en vez de pasar a `CANCELLED` directo, mutar a `AVAILABLE_FOR_REASSIGNMENT` (patientId → null) y encolar un job stub para el motor (que en fase 2 no hace nada todavía, sólo loguea).
- [ ] Booking público desde web del paciente (sin auth de profesional, con auth de paciente por OTP).
- [ ] `apps/web` — Next.js:
  - Login profesional, agenda semanal, cargar disponibilidad, cargar tipos de servicio, cancelar turno.
  - Flujo público del paciente: registro, login por OTP, sacar turno, cancelar, anotarse en waitlist.

### Fase 3 — Motor de reasignación (el diferencial)

- [ ] Worker BullMQ que procesa jobs de "notificar próximo candidato".
- [ ] Selección FIFO por grupo de prioridad (sec 6.3).
- [ ] Cálculo del tiempo restante **al momento de enviar** cada notificación (sec 6.5).
- [ ] Respeto de ventana horaria 7:00–22:00 en TZ de la cuenta (sec 6.6).
- [ ] Modo broadcast simultáneo cuando falta <1h (fanout con piso 10 min).
- [ ] Endpoint atómico de confirmación (`UPDATE ... WHERE status='AVAILABLE_FOR_REASSIGNMENT' RETURNING`) — usado por WhatsApp y web indistintamente. **No** duplicar la lógica por canal.
- [ ] Flujo recursivo de adelantamiento (sec 6.7): tomar un turno adelantado cancela el original y ese cupo vuelve a entrar al motor.
- [ ] `NotificationChannel` abstracto con impl `SimulatedChannel` (persiste `NotificationLog` sin salir a la red) para poder testear todo el motor sin Kapso.
- [ ] Suite de tests de concurrencia:
  - Dos confirmaciones simultáneas → una gana, la otra recibe conflicto.
  - Broadcast con varios respondedores en paralelo.
  - Cancelación de madrugada → notificación programada a las 7:00 con tiempo recalculado.

### Fase 4 — Integraciones externas reales

- [ ] Kapso:
  - Módulo `integrations/kapso` con cliente HTTP.
  - Webhook entrante con validación de firma (`KAPSO_WEBHOOK_SECRET`).
  - Menú guiado con botones + WhatsApp Flows para: sacar turno, elegir profesional, elegir servicio, confirmar, cancelar, responder al motor.
  - OTP real de paciente (reemplaza el canal simulado).
  - Reemplazo de `SimulatedChannel` por `KapsoChannel` (misma interfaz).
- [ ] Google Calendar:
  - Módulo `integrations/google-calendar` con OAuth2 por profesional.
  - Endpoint de callback + almacenamiento cifrado del refresh token.
  - Sync bidireccional en cada create/cancel/reassign (fuente de verdad: nuestra DB; Google es reflejo).

### Fase 5 — Recordatorio y auto-cancelación (sec 5.4)

- [ ] Al crear un turno, programar job BullMQ para 48h antes → mandar recordatorio WhatsApp pidiendo confirmar.
- [ ] Programar job para 24h antes → si el turno no está `CONFIRMED`, cancelarlo automáticamente.
- [ ] La auto-cancelación entra al motor de reasignación por el mismo path que una cancelación manual.
- [ ] El texto del recordatorio debe incluir literalmente la hora deadline.

### Deuda técnica conocida (a resolver antes de prod)

- [ ] Refresh tokens de Google guardados en claro en DB — hay que cifrar con una key en `.env` (`ENCRYPTION_KEY`) o usar un vault.
- [ ] Rate limiting global (ni `@nestjs/throttler` ni nada equivalente instalado).
- [ ] CORS: `main.ts` no habilita CORS todavía. Cuando levante el frontend hay que abrirle el origen.
- [ ] Logging estructurado (por ahora usa el Logger default de Nest).
- [ ] Observabilidad (Sentry / OpenTelemetry).
- [ ] Tests: no hay ni unit ni e2e todavía. La suite del motor (fase 3) es la primera prioridad.
- [ ] Seed de dev — script para poblar la DB con una cuenta + profesional + servicios + pacientes de prueba.
- [ ] Migrations en CI, no `migrate dev` en prod (usar `prisma migrate deploy`).

### Decisiones aún sin cerrar

Todas las de sec 11 quedaron resueltas al arrancar. Si algo cambia (ej. el criterio de orden de la waitlist deja de ser FIFO puro), hay que revisar el índice `WaitlistEntry(professionalId, status, createdAt)` y la query de selección de candidatos en el motor (fase 3).
