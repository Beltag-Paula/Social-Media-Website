FROM node:26-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev && npm cache clean --force

RUN npm approve-scripts sqlite3

COPY . .

RUN mkdir -p uploads && chown -R node:node /app
USER node

EXPOSE 8000

CMD ["node", "server.js"]
