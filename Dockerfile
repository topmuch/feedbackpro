# ============================================================
# Dockerfile — FeedbackPro Next.js 16 standalone production build
# ------------------------------------------------------------
# Build multi-étapes :
#   1. deps    : installe les dépendances Node (bun)
#   2. builder : prisma generate + next build → standalone server
#   3. runner  : image finale minimaliste, sert server.js sur 3000
#
# La base SQLite est persistée dans /app/db (volume Coolify).
# Variables d'environnement requises :
#   DATABASE_URL=file:/app/db/custom.db
#   NEXTAUTH_URL=https://feedbackpro.qrtags.pro
#   NEXTAUTH_SECRET=<généré>
# ============================================================

# ---------- Stage 1 : deps ----------
FROM oven/bun:1 AS deps
WORKDIR /app

# Copie uniquement les fichiers de dépendances pour profiter du cache Docker
COPY package.json bun.lock* yarn.lock* package-lock.json* ./
COPY prisma ./prisma

# Installe les dépendances (prisma generate via postinstall)
RUN bun install --frozen-lockfile 2>/dev/null || bun install

# ---------- Stage 2 : builder ----------
FROM oven/bun:1 AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build Next.js standalone : prisma generate + next build + copie static/public
# Le build crée .next/standalone/server.js + .next/standalone/.next/static
RUN bun run build

# ---------- Stage 3 : runner (image finale) ----------
FROM oven/bun:1 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Base SQLite dans un volume persistant
ENV DATABASE_URL=file:/app/db/custom.db

# Crée le dossier de la base SQLite
RUN mkdir -p /app/db

# Copie le serveur standalone + assets statiques + public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/standalone/.next/static ./.next/static
COPY --from=builder /app/.next/standalone/public ./public

# Copie prisma (pour db push au démarrage si besoin)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copie le package.json (pour le script start)
COPY --from=builder /app/package.json ./package.json

# Expose le port Next.js
EXPOSE 3000

# Volume pour la base SQLite persistante
VOLUME ["/app/db"]

# Démarre le serveur standalone Next.js
CMD ["bun", "server.js"]
