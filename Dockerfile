# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY frontend/package*.json ./frontend/
COPY backend/package*.json ./backend/

# Install dependencies (with cache optimization)
RUN npm ci --prefer-offline --no-audit

# Copy source files
COPY shared ./shared
COPY frontend ./frontend
COPY backend ./backend

# Build shared package
WORKDIR /app/shared
RUN npm run build

# Build frontend
WORKDIR /app/frontend
RUN npm run build

# Build backend
WORKDIR /app/backend
RUN npm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/

# Install production dependencies only (with cache optimization)
RUN npm ci --production --prefer-offline --no-audit

# Copy built files
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/frontend/dist ./frontend/dist
COPY --from=builder /app/backend/node_modules ./backend/node_modules

# Create config and data directories
RUN mkdir -p /app/config /app/data

# Expose port
EXPOSE 5839

# Start the application
CMD ["node", "backend/dist/index.js"]

