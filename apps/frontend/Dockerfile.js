FROM node:18.20-alpine3.20

WORKDIR /app

# Copy package files (package-lock.json is optional in monorepo)
COPY package.json ./
COPY package-lock.json* ./

# Install only ws package which is needed for the server
RUN npm install --legacy-peer-deps ws@8.18.1

# Copy the server code
COPY server.js ./server.js

# Default port (will be overridden by Render)
EXPOSE 10000

# Set environment variables
ENV NODE_ENV=production

# Start command
CMD ["node", "server.js"]