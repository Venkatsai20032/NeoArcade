# ==========================================
# NEO-TIC Arena - Production Dockerfile
# Lightweight, Zero-Dependency Self-Hosting
# ==========================================

FROM node:22-alpine AS runner

# Set working directory
WORKDIR /app

# Install production dependencies first (caching layer)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy application files
COPY server.js db.js ./
COPY public ./public

# Create directory for persistent SQLite database
RUN mkdir -p /app/data && chown -R node:node /app

# Switch to non-root user for security
USER node

# Environment defaults
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATABASE_PATH=/app/data/arena_game.db

# Expose port
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/network-info || exit 1

# Start the Arena server
CMD ["node", "server.js"]
