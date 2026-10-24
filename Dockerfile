FROM node:22-bullseye-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg imagemagick webp ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .

ENV NODE_ENV=production
EXPOSE 8000
CMD ["node", "index.js"]
