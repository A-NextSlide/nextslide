#!/bin/bash
# Script to deploy the WebSocket server to Render

# Exit on error
set -e

echo "Deploying WebSocket server to Render..."

# Check if render CLI is installed
if ! command -v render &> /dev/null; then
    echo "Render CLI is not installed. Installing now..."
    curl -s https://cli.render.com/api/install | bash
fi

# Optional - Blueprint deployment using render.yaml
# This is useful for the first deployment
if [ "$1" == "blueprint" ]; then
    echo "Deploying using Blueprint (render.yaml)..."
    render blueprint create
    exit 0
fi

# Push code to GitHub first if requested
if [ "$1" == "push" ]; then
    BRANCH=$(git branch --show-current)
    echo "Pushing current branch '$BRANCH' to GitHub..."
    git push origin $BRANCH
fi

# Deploy the websocket service
echo "Deploying websocket service..."
render deploy -s slide-websocket

echo "Deployment complete! The service will be available in a few minutes."
echo "Check status in the Render dashboard: https://dashboard.render.com"