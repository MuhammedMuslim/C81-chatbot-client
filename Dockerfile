# Build static assets (same-origin /api via nginx in run stage)
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY public ./public
COPY src ./src

# Empty = browser calls /api/... on the same origin; nginx proxies to Spring Boot (on-prem / Docker).
# Set only if you serve the API on a different public URL without nginx proxy.
ARG REACT_APP_API_BASE_URL=
ENV REACT_APP_API_BASE_URL=$REACT_APP_API_BASE_URL

RUN npm run build

# Serve SPA and proxy /api to Spring Boot (upstream from BACKEND_HOST / BACKEND_PORT at runtime)
FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
COPY nginx/templates/default.conf.template /etc/nginx/templates/default.conf.template
ENV BACKEND_HOST=backend BACKEND_PORT=8080

EXPOSE 80
