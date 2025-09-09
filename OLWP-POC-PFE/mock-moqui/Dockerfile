FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./


# Change ownership
RUN chown -R node:node /app

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .


USER node

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start the application
CMD ["npm", "start"]