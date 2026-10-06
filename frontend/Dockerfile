FROM node:22-alpine AS build
WORKDIR /app/frontend
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_ORIGIN=/api
ENV VITE_API_ORIGIN=$VITE_API_ORIGIN
RUN npm run build
# Build on startup too: the Practicum test runner mounts dist and sets VITE_API_ORIGIN at runtime.
CMD ["npm", "run", "build"]
