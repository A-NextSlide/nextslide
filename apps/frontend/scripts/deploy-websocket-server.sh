#!/bin/bash
# Script to deploy the WebSocket server to a production environment

# Make the script exit on error
set -e

# Build the Docker image
echo "Building WebSocket server Docker image..."
docker build -t slide-sorcery-websocket -f Dockerfile.websocket .

# Check if we're deploying locally or to a remote server
if [ "$1" == "local" ]; then
  echo "Deploying locally using docker-compose..."
  docker-compose -f docker-compose.websocket.yml up -d
elif [ "$1" == "production" ]; then
  if [ -z "$2" ]; then
    echo "Error: Production server address required"
    echo "Usage: $0 production <server-address>"
    exit 1
  fi
  
  SERVER_ADDRESS=$2
  
  echo "Deploying to production server at $SERVER_ADDRESS..."
  
  # Tag image for remote repository if using one
  # docker tag slide-sorcery-websocket your-registry.com/slide-sorcery-websocket:latest
  # docker push your-registry.com/slide-sorcery-websocket:latest
  
  # Alternative: Copy files to server and build there
  echo "Copying files to server..."
  scp Dockerfile.websocket docker-compose.websocket.yml package.json package-lock.json tsconfig.json "$SERVER_ADDRESS:~/"
  
  # Create server directory if it doesn't exist
  ssh "$SERVER_ADDRESS" "mkdir -p ~/server"
  
  # Copy the WebSocket server file
  scp src/server/WebSocketServer.ts "$SERVER_ADDRESS:~/server/"
  
  # SSH into the server and start the container
  echo "Starting the container on the remote server..."
  ssh "$SERVER_ADDRESS" "cd ~/ && docker-compose -f docker-compose.websocket.yml up -d"
  
  echo "Deployment completed successfully!"
else
  echo "Error: Invalid deployment target"
  echo "Usage: $0 [local|production <server-address>]"
  exit 1
fi

echo "WebSocket server deployed successfully!"