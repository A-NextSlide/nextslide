#!/bin/bash
# Script to run SSR API service and evaluation in one command

# Check for experiment files
if [ $# -eq 0 ]; then
  echo "Usage: ./run-ssr-evaluation.sh <experiment_file1.json> [experiment_file2.json ...]"
  echo "Example: ./run-ssr-evaluation.sh change-text-color.json"
  exit 1
fi

# Function to check if port is in use
is_port_in_use() {
  if command -v nc >/dev/null 2>&1; then
    nc -z localhost $1 >/dev/null 2>&1
    return $?
  elif command -v lsof >/dev/null 2>&1; then
    lsof -i :$1 >/dev/null 2>&1
    return $?
  else
    return 1  # Assume port is available if we can't check
  fi
}

# Set up variables
SSR_PORT=3030
SSR_PID=""
TEMP_DIR=$(mktemp -d)
echo "Using temporary directory: $TEMP_DIR"

# Create a trap to clean up when script exits
cleanup() {
  echo "Cleaning up..."
  if [ -n "$SSR_PID" ]; then
    echo "Stopping SSR API service (PID: $SSR_PID)"
    kill $SSR_PID 2>/dev/null || true
  fi
  echo "Removing temporary directory: $TEMP_DIR"
  rm -rf "$TEMP_DIR"
  echo "Done."
}
trap cleanup EXIT

# Check if SSR API is already running on the default port
if is_port_in_use $SSR_PORT; then
  echo "SSR API service is already running on port $SSR_PORT."
  echo "Using existing service for rendering."
else
  echo "Starting SSR API service on port $SSR_PORT..."
  
  # Start the SSR API service with clustering
  export TEMP_DIR=$TEMP_DIR
  export PORT=$SSR_PORT
  export WORKER_COUNT=2
  
  # Start the service in the background
  npm run ssr:start > "$TEMP_DIR/ssr-service.log" 2>&1 &
  SSR_PID=$!
  
  echo "SSR API service started with PID: $SSR_PID"
  echo "SSR logs: $TEMP_DIR/ssr-service.log"
  
  # Wait for the service to be ready (health check)
  echo "Waiting for the SSR API service to be ready..."
  MAX_ATTEMPTS=30
  ATTEMPT=0
  SUCCESS=false
  
  while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    ATTEMPT=$((ATTEMPT+1))
    if curl -s http://localhost:$SSR_PORT/health >/dev/null 2>&1; then
      SUCCESS=true
      break
    fi
    echo -n "."
    sleep 1
  done
  echo ""
  
  if [ "$SUCCESS" = true ]; then
    echo "✓ SSR API service is ready!"
  else
    echo "⚠️ SSR API service failed to start or health check failed after $MAX_ATTEMPTS attempts."
    echo "Will proceed anyway, but rendering may fall back to direct mode."
  fi
fi

# Run the experiment with SSR API enabled
echo "Running experiments: $@"
npm run experiment -- --ssr "http://localhost:$SSR_PORT" "$@"

echo "Experiments completed!"