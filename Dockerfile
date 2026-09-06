FROM node:26-alpine

WORKDIR /app

COPY package*.json ./
# --omit=dev replaces the deprecated --only=production flag; nodemon
# (moved to devDependencies) is skipped in the image either way.
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# SECURITY: run as the low-privilege `node` account the base image
# already provides, instead of root. If the container is ever compromised
# (a bad dependency, an unpatched CVE, whatever), this limits what the
# attacker's process can touch on the host/volume.
#
# database/ and uploads/ need to be writable by that user — sqlite writes
# the .db file in place, and file uploads land under uploads/.
RUN mkdir -p uploads && chown -R node:node /app
USER node

EXPOSE 8000

CMD ["node", "server.js"]
