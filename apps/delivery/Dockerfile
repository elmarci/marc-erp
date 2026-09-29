# ─── Dependencies ────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install

# ─── Builder ─────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Vite incrusta las variables VITE_* en el bundle en tiempo de BUILD, no de
# arranque — Railway las expone como variables del servicio, pero un
# Dockerfile solo las recibe si se declaran como ARG explícitamente. Sin
# esto, el build siempre caía al fallback de src/api.ts (localhost:3001),
# que es justo lo que pasaba en producción.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ─── Production ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app
RUN npm install -g serve
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["sh", "-c", "serve -s dist -l ${PORT:-3000}"]
