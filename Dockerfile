# FeedbackPro - Dockerfile for Coolify
# Adapté du modèle QRBag — installation propre, single-stage
FROM node:20-alpine

# Install required packages
RUN apk add --no-cache git libc6-compat sqlite
RUN npm install -g bun

WORKDIR /app

# Clone the repository
RUN git clone https://github.com/topmuch/feedbackpro.git .

# Install dependencies
RUN bun install

# Generate Prisma Client
RUN npx prisma generate

# Build the application
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=file:/app/data/feedbackpro.db
RUN bun run build

# Copy Prisma client to standalone (Next.js standalone ne l'inclut pas)
RUN cp -r node_modules/.prisma .next/standalone/node_modules/.prisma 2>/dev/null || true
RUN cp -r node_modules/@prisma .next/standalone/node_modules/@prisma 2>/dev/null || true

# Create data directory
RUN mkdir -p /app/data

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV DATABASE_URL=file:/app/data/feedbackpro.db

# Start command - push schema, create admin, create z-ai config, start server
CMD sh -c "mkdir -p /app/data && export DATABASE_URL=file:/app/data/feedbackpro.db && npx prisma db push --skip-generate --accept-data-loss 2>/dev/null || true && node scripts/create-admin.cjs 2>/dev/null || true && if [ -n \"$Z_AI_CONFIG\" ]; then echo \"$Z_AI_CONFIG\" > /etc/.z-ai-config; fi && exec node .next/standalone/server.js"
