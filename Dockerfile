FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (production only)
RUN npm install --production

# Copy application source
COPY . .

# Expose port (default 3000)
EXPOSE 3000

# Start application
CMD ["node", "index.js"]
