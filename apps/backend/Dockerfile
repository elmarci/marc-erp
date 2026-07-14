# ─── Base ─────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl

# ─── Dependencies ────────────────────────────────────────────────────────────
FROM base AS deps
COPY package*.json ./
RUN npm install --only=production && cp -R node_modules /prod_modules
RUN npm install

# ─── Development ─────────────────────────────────────────────────────────────
FROM base AS development
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
EXPOSE 3001
CMD ["npm", "run", "dev"]

# ─── Builder ─────────────────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ─── Production ──────────────────────────────────────────────────────────────
FROM base AS production
ENV NODE_ENV=production
RUN apk add --no-cache su-exec && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 erp
COPY --from=builder /app/dist ./dist
COPY --from=deps /prod_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY --from=builder /app/prisma ./prisma
COPY package.json ./
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN mkdir -p uploads backups && chown -R erp:nodejs uploads backups && \
    chmod +x /usr/local/bin/docker-entrypoint.sh
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
