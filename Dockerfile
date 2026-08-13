# ---- Build stage -----------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

# Install dependencies first for better layer caching
COPY package.json package-lock.json ./
RUN npm ci

# Environment baked into the production bundle at build time.
# VITE_CONVEX_URL points at the Convex deployment the frontend talks to.
ARG VITE_CONVEX_URL
ENV VITE_CONVEX_URL=$VITE_CONVEX_URL
# Optional integration key for the Vly plugin (no-op when empty).
ARG VLY_INTEGRATION_KEY
ENV VLY_INTEGRATION_KEY=$VLY_INTEGRATION_KEY

# Copy the rest of the source and build
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
