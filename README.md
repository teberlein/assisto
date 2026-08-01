# Asissto

Sistema de gestión de turnos con motor de reasignación automática.
Ver [`especificacion-producto.md`](./especificacion-producto.md) para el detalle de producto.

## Estado

**Fase 1 completa** — modelo de datos + backend base con auth y CRUDs, sin lógica de agenda ni motor.
Próximo: fase 2 (agenda + panel web).

## Requisitos

- Node.js 20+
- pnpm 9+
- Docker (para Postgres + Redis local)

## Setup

```bash
# 1. Variables de entorno
cp .env.example .env

# 2. Servicios
pnpm docker:up

# 3. Dependencias
pnpm install

# 4. DB (crea la primera migración a partir del schema)
pnpm db:generate
cd apps/api && pnpm prisma migrate dev --name init && cd ../..

# 5. Levantar API
pnpm api:dev
```

API en `http://localhost:3001/api`.

## Endpoints (fase 1)

### Auth
- `POST /api/auth/signup-owner` — crea Account + primer User (rol OWNER)
- `POST /api/auth/login` — devuelve JWT
- `POST /api/auth/patient/otp/request` — envía OTP (simulado en fase 1)
- `POST /api/auth/patient/otp/verify` — valida OTP y devuelve JWT de paciente

### Cuenta / profesionales
- `GET /api/accounts/me`
- `PATCH /api/accounts/me` (OWNER)
- `POST /api/professionals` (OWNER) — crea profesional + user
- `GET /api/professionals`
- `GET /api/professionals/:id`

### Servicios / disponibilidad
- `GET|POST /api/professionals/:professionalId/service-types`
- `PATCH|DELETE /api/professionals/:professionalId/service-types/:id`
- `GET|POST /api/professionals/:professionalId/availability`
- `DELETE /api/professionals/:professionalId/availability/:id`

### Pacientes / turnos
- `POST /api/patients/register` (público)
- `POST /api/appointments`
- `GET /api/appointments?professionalId=&from=&to=`
- `DELETE /api/appointments/:id?by=professional|patient|system`

### Waitlist (schema listo, motor viene en fase 3)
- `POST /api/waitlist`
- `GET /api/waitlist?professionalId=`
- `DELETE /api/waitlist/:id`

## Decisiones (sec 11)

- Auth profesional: **email + password (JWT)**
- Auth paciente: **OTP por WhatsApp** — canal simulado hasta fase 4
- Orden waitlist: **FIFO** por `createdAt`
- Timezone: **por cuenta** (`Account.timezone`), default `America/Argentina/Buenos_Aires`
- Roles: **OWNER + PROFESSIONAL** (un mismo user puede tener ambos)
- ServiceType: lo carga cada profesional
