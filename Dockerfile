FROM node:26-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY . .
EXPOSE 8000
CMD ["node", "server.js"]   
