FROM node:26-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev && npm cache clean --force

COPY . .

RUN mkdir -p uploads && chown -R node:node /app
USER node

EXPOSE 8000

CMD ["node", "server.js"]
