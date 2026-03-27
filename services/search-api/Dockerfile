FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache dumb-init

FROM base AS dependencies
COPY package*.json ./
RUN npm ci

FROM base AS development
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
EXPOSE 8001
CMD ["npm", "run", "start:dev"]

FROM dependencies AS builder
COPY . .
RUN npm run build
RUN npm prune --production

FROM base AS production
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nestjs
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
RUN chown -R nestjs:nodejs /app
USER nestjs
EXPOSE 8001
HEALTHCHECK --interval=30s --timeout=10s CMD wget -q --spider http://localhost:8001/api/v1/health/live || exit 1
CMD ["dumb-init", "node", "dist/main"]
