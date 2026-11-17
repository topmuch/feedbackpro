# FeedbackPro - Dockerfile for Coolify
# node:22-alpine (la version qui marche pour Next.js 16 pre-rendering)
FROM node:22-alpine

RUN apk add --no-cache git libc6-compat sqlite
RUN npm install -g bun

WORKDIR /app

# Clone (--single-branch pour différer du cache précédent)
RUN git clone --branch main --single-branch --depth 1 https://github.com/topmuch/feedbackpro.git .

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

CMD sh -c "mkdir -p /app/data && export DATABASE_URL=file:/app/data/feedbackpro.db && npx prisma db push --skip-generate --accept-data-loss 2>/dev/null || true && node scripts/create-admin.cjs 2>/dev/null || true && if [ -n \"$Z_AI_CONFIG\" ]; then echo \"$Z_AI_CONFIG\" > /etc/.z-ai-config; fi && exec node .next/standalone/server.js"
