FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install only ws package which is needed for the server
RUN npm install ws@8.18.1

# Copy the server code
COPY server.js ./server.js

# Default port (will be overridden by Render)
EXPOSE 10000

# Set environment variables
ENV NODE_ENV=production

# Start command
CMD ["node", "server.js"]