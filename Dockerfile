# ============================================================
# Dockerfile — FeedbackPro Next.js 16 standalone production build
# ------------------------------------------------------------
# Utilise Node.js (pas Bun) pour le build — Bun causait un bug
# TypeError useContext sur /_global-error pendant le pre-rendering.
# ============================================================

# ---------- Stage 1 : deps ----------
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json* bun.lock* ./
COPY prisma ./prisma

RUN npm install --legacy-peer-deps 2>/dev/null || npm install

# ---------- Stage 2 : builder ----------
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build avec Node.js (pas Bun) — évite le bug useContext
RUN npx prisma generate
RUN npx next build
RUN cp -r .next/static .next/standalone/.next/ 2>/dev/null || true
RUN cp -r public .next/standalone/ 2>/dev/null || true

# ---------- Stage 3 : runner ----------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL=file:/app/db/custom.db

RUN mkdir -p /app/db

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/standalone/.next/static ./.next/static
COPY --from=builder /app/.next/standalone/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000
VOLUME ["/app/db"]

CMD ["node", "server.js"]
