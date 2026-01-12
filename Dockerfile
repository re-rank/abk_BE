# 공식 Playwright 이미지 사용 (모든 브라우저 의존성 포함)
FROM mcr.microsoft.com/playwright:v1.40.1-jammy

WORKDIR /app

# Set environment variables
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy source code and build
COPY . .
RUN npm run build || (npm ci && npm run build)

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "dist/main"]
