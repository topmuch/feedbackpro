# FeedbackPro - Dockerfile for Coolify
# node:22-alpine (la version qui marche pour Next.js 16 pre-rendering)
FROM node:22-alpine

RUN apk add --no-cache git libc6-compat sqlite
RUN npm install -g bun

WORKDIR /app

# Téléchargement du code via tarball GitHub (jamais caché par Docker car
# l'URL retourne un contenu différent à chaque commit). Plus fiable que
# `git clone` dont le layer Docker peut être réutilisé tel quel même avec
# un echo cache-bust.
ADD https://github.com/topmuch/feedbackpro/archive/refs/heads/main.tar.gz /tmp/code.tar.gz
RUN tar -xzf /tmp/code.tar.gz -C /app --strip-components=1 && rm /tmp/code.tar.gz && \
    echo "build-v53-voice-all-actions-rounded-header-qr-config-signalement-redesign" && git log --oneline -1 2>/dev/null || echo "no git log"

RUN bun install
RUN npx prisma generate

ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=file:/app/data/feedbackpro.db
RUN bun run build

RUN cp -r node_modules/.prisma .next/standalone/node_modules/.prisma 2>/dev/null || true
RUN cp -r node_modules/@prisma .next/standalone/node_modules/@prisma 2>/dev/null || true

RUN mkdir -p /app/data

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV DATABASE_URL=file:/app/data/feedbackpro.db

CMD sh -c "mkdir -p /app/data && export DATABASE_URL=file:/app/data/feedbackpro.db && npx prisma db push --skip-generate --accept-data-loss 2>/dev/null || true && node scripts/create-admin.cjs && if [ -n \"$Z_AI_CONFIG\" ]; then echo \"$Z_AI_CONFIG\" > /etc/.z-ai-config; fi && exec node .next/standalone/server.js"
