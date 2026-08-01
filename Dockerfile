# Build de apps/api (NestJS) para Railway/Render, respetando el workspace pnpm.
# Debian slim (no Alpine) para que el engine de Prisma tenga OpenSSL sin líos.

FROM node:20-slim AS base
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

# ---- build: instala deps de la API, genera Prisma Client y compila ----
FROM base AS build
COPY . .
# `@asissto/api...` trae la API y sus deps de workspace (hoy, ninguna),
# evitando instalar Next/React de apps/web.
RUN pnpm install --frozen-lockfile --filter @asissto/api...
RUN pnpm --filter @asissto/api exec prisma generate
RUN pnpm --filter @asissto/api build

# ---- runtime: corre migraciones y arranca el server + worker de colas ----
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/api
# `migrate deploy` aplica las migraciones ya versionadas (no crea nuevas).
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main"]
