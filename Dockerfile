# Build stage
FROM node:18-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:18-slim AS production

# Install ALL dependencies for Playwright Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Core libraries
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libatspi2.0-0 \
    # X11 libraries
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libxcb1 \
    libx11-6 \
    libx11-xcb1 \
    libxext6 \
    libxshmfence1 \
    # Graphics & Audio
    libasound2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libcairo2 \
    libcairo-gobject2 \
    # GTK dependencies
    libgdk-pixbuf2.0-0 \
    libgtk-3-0 \
    libglib2.0-0 \
    # Fonts
    fonts-liberation \
    fonts-noto-cjk \
    fonts-freefont-ttf \
    # Utilities
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

WORKDIR /app

# Set Playwright browsers path BEFORE npm ci
ENV PLAYWRIGHT_BROWSERS_PATH=/app/.cache/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Install Playwright Chromium browser
RUN npx playwright install chromium

# Verify Chromium installation
RUN ls -la /app/.cache/ms-playwright/ || echo "Playwright cache not found"
RUN ls -la /app/.cache/ms-playwright/chromium-*/chrome-linux64/ || echo "Chromium not found"

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Set environment variables
ENV NODE_ENV=production

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start the application
CMD ["node", "dist/main"]
