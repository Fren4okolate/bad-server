FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && mkdir -p temp src/public/images && chown -R node:node /app
USER node
CMD ["node", "dist/app.js"]
