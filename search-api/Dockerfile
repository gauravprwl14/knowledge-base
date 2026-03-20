FROM node:20-alpine AS deps

WORKDIR /app

# Install all deps (dev+prod) — needed for both dev hot-reload and production build
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN npm install --legacy-peer-deps

# ---- development stage (hot reload via volume mount) ----
FROM node:20-alpine AS development

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma/

EXPOSE 8001
ENV NODE_ENV=development

# Source code is mounted as volume — enables hot reload without rebuild
CMD ["npm", "run", "start:dev"]

# ---- builder: compile TypeScript ----
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma/
RUN npx prisma generate

# Copy source and compile
COPY . .
RUN npm run build

# ---- runtime image ----
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

EXPOSE 8001

CMD ["node", "dist/main"]
