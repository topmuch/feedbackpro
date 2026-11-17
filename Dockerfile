# ============================================================
# Dockerfile — FeedbackPro Next.js 16 (Bun + standalone)
# Revenir au setup qui fonctionnait (bun install + bun run build)
# ============================================================

FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache git libc6-compat
RUN npm install -g bun
COPY bun.lock* package.json ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile 2>/dev/null || bun install
COPY . .
RUN bunx prisma generate
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN bun run build

# Pre-seed DB during build
RUN mkdir -p /app/data
RUN DATABASE_URL="file:/app/data/custom.db" bun run db:push --accept-data-loss 2>/dev/null || true
RUN DATABASE_URL="file:/app/data/custom.db" bun run db:seed 2>/dev/null || true

# ---------- Runner ----------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL=file:/app/data/custom.db
RUN mkdir -p /app/data /app/db
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/standalone/.next/static ./.next/static
COPY --from=builder /app/.next/standalone/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/data ./data
EXPOSE 3000
# Pas de VOLUME — sinon le volume vide écrase la DB seedée pendant le build
CMD ["node", "server.js"]
