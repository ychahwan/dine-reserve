# ---------------------------------------------------------------------------
# Kamix — Render Web Service (static frontend → hosted Convex)
#
# Builds the React/Vite frontend and serves it with nginx.
# VITE_CONVEX_URL must be set as a build arg or Render env var.
#
# Usage:
#   docker build --build-arg VITE_CONVEX_URL=https://xxx.convex.cloud -t kamix .
#   docker run -p 80:80 kamix
# ---------------------------------------------------------------------------

# ---- Build stage -----------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

ARG VITE_CONVEX_URL=https://canny-leopard-341.convex.cloud
ENV VITE_CONVEX_URL=$VITE_CONVEX_URL

COPY . .
RUN npm run build

# ---- Serve stage -----------------------------------------------------------
FROM nginx:1.27-alpine AS serve
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/ >/dev/null 2>&1 || exit 1
CMD ["nginx", "-g", "daemon off;"]
