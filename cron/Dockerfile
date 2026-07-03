FROM node:22-alpine
WORKDIR /app

RUN apk add --no-cache postgresql-client

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY scripts ./scripts
COPY tsconfig.json ./tsconfig.json

CMD ["npx", "tsx", "scripts/backup-database.ts"]
