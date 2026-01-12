# Build stage - 모든 의존성으로 빌드
FROM node:18-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for nest build)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage - Playwright 이미지 사용
FROM mcr.microsoft.com/playwright:v1.57.0-jammy

WORKDIR /app

# Set environment variables
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "dist/main"]
