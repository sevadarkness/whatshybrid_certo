FROM node:20-alpine

WORKDIR /app

# Default DB url for Prisma generate/build (pode ser sobrescrito em runtime)
ENV DATABASE_URL=file:./data.db

# Copia manifests + prisma schema antes do install para permitir `prisma generate` no build
COPY backend/package.json backend/package-lock.json* ./
COPY backend/prisma ./prisma

# Instala deps (inclui devDeps para ter o CLI do Prisma), gera o Prisma Client e remove devDeps
RUN npm install \
 && npx prisma generate \
 && npm prune --production

# Copia o código fonte do backend (após cache do npm)
COPY backend/src ./src

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "src/index.js"]
