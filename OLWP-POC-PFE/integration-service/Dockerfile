FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

RUN chown -R node:node /app

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Change ownership of the app directory

USER node

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

# Start the application
CMD ["npm", "start"]