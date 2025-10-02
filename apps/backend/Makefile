# Makefile for slide-backend development

.PHONY: help test deploy check verify lint format run clean init-registry kill-all force-kill check-ports run-all run-all-verbose run-renderer run-headless run-simple-headless ensure-deps

# Allow overriding the server port
PORT ?= 9090

help:
	@echo "Available commands:"
	@echo "  make test            - Run pre-deployment tests"
	@echo "  make check           - Quick syntax check only"
	@echo "  make verify          - Verify Python 3.12 compatibility"
	@echo "  make lint            - Run linting (if configured)"
	@echo "  make format          - Format code with black"
	@echo "  make run             - Run backend server only (port 9090)"
	@echo "  make run-info        - Run backend with INFO logging (shows OpenAI responses)"
	@echo "  make run-renderer    - Run frontend renderer (needs browser tabs)"
	@echo "  make run-headless    - Run headless renderers (no browser needed)"
	@echo "  make run-all         - Run all services (clean output)"
	@echo "  make run-all-verbose - Run all services (verbose output for debugging)"
	@echo "  make init-registry   - Initialize backend registry from saved schemas"
	@echo "  make kill-all        - Kill all services (backend + renderer)"
	@echo "  make force-kill      - Force kill ALL Node.js and Python processes"
	@echo "  make check-ports     - Check what's using ports 8080, 9090, 3334"
	@echo "  make deploy          - Test and deploy to Render"
	@echo "  make clean           - Clean cache files"

# Run comprehensive pre-deployment tests
test:
	@echo "🧪 Running pre-deployment tests..."
	@python scripts/test_before_deploy.py

# Quick syntax check
check:
	@echo "🔍 Quick syntax check..."
	@python -m py_compile agents/generation/deck_composer.py
	@python -m py_compile api/chat_server.py
	@python -m py_compile services/text_validation_service.py
	@echo "✅ Core files compile successfully"

# Verify Python 3.12 compatibility
verify:
	@python scripts/verify_deploy_ready.py

# Lint code (install: pip install flake8)
lint:
	@echo "🔍 Linting code..."
	@flake8 . --exclude=venv,__pycache__ --max-line-length=120 --ignore=E501,W503 || true

# Format code (install: pip install black)
format:
	@echo "🎨 Formatting code..."
	@black . --exclude=venv || echo "Install black: pip install black"

# Run server locally
run:
	@echo "🚀 Starting local server on port $(PORT)..."
	@./venv/bin/python -m pip install -q uvicorn fastapi sentry-sdk >/dev/null 2>&1 || true
	@./venv/bin/python -m uvicorn api.chat_server:app --reload --host 0.0.0.0 --port $(PORT)

# Run server with explicit INFO logging (shows OpenAI responses)
run-info:
	@echo "🚀 Starting local server with INFO logging on port $(PORT)..."
	@./venv/bin/python -m pip install -q uvicorn fastapi sentry-sdk >/dev/null 2>&1 || true
	@./venv/bin/python -m uvicorn api.chat_server:app --reload --host 0.0.0.0 --port $(PORT) --log-level info

# Run both backend and frontend renderer
run-all:
	@echo "🧹 Checking for port conflicts..."
	@if lsof -iTCP:9090 -sTCP:LISTEN >/dev/null 2>&1; then \
		echo "❌ Port 9090 is already in use. Run 'make kill-all' first."; \
		exit 1; \
	fi
	@if lsof -iTCP:8080 -sTCP:LISTEN >/dev/null 2>&1; then \
		echo "❌ Port 8080 is already in use. Run 'make kill-all' first."; \
		exit 1; \
	fi
	@if lsof -iTCP:3334 -sTCP:LISTEN >/dev/null 2>&1; then \
		echo "❌ Port 3334 is already in use. Run 'make kill-all' first."; \
		exit 1; \
	fi
	@echo "✅ All ports are available"
	@echo ""
	@echo "🚀 Starting backend server on port 9090..."
	@./venv/bin/python -m uvicorn api.chat_server:app --reload --host 0.0.0.0 --port 9090 2>&1 | sed 's/===== REGISTRY DATA RECEIVED =====/[Registry Update]/g' | grep -v "Writing schemas to" &
	@sleep 3
	@echo "✅ Backend server started"
	@echo ""
	@echo "🌐 Starting frontend dev server on port 8080..."
	@cd ../../interactive-slide-sorcery && PORT=8080 npm run dev 2>&1 | grep -vE "(proxy error|ECONNREFUSED|http proxy error)" &
	@sleep 8
	@echo "✅ Frontend server started"
	@echo ""
	@echo "📦 Starting renderer API on port 3334..."
	@cd ../../interactive-slide-sorcery && PORT=3334 npx tsx ssr/api-server.ts 2>&1 | grep -v "REGISTRY DATA" &
	@sleep 3
	@echo "✅ Renderer API started"
	@echo ""
	@echo "🤖 Starting 4 headless Chrome instances..."
	@cd ../../interactive-slide-sorcery && npx tsx ssr/puppet.ts --url http://localhost:8080/renderer --instances 4 2>&1 | \
		grep -vE "(Page Log:|WebSocket connection to|WebSocket error:|WebSocket closed:|Attempting to connect|loadDeck|vite\] connecting|vite\] connected|Download the React DevTools|__name is not defined|vite\] server connection lost|Polling for restart|WebSocket opened, sending renderer-ready)" | \
		grep -E "(Browser instance|launched successfully|Error launching|Starting render|Render complete|Page loaded:|ERROR:|Warning:|Important:)" &
	@sleep 5
	@echo ""
	@echo "============================================================"
	@echo "✅ All services started successfully!"
	@echo "============================================================"
	@echo ""
	@echo "📊 Services running on:"
	@echo "   - Backend API: http://localhost:9090"
	@echo "   - Frontend: http://localhost:8080"
	@echo "   - Renderer API: http://localhost:3334"
	@echo ""
	@echo "🔄 Registry auto-loaded from saved schemas"
	@echo ""
	@echo "Press Ctrl+C to stop all services"

# Run just the renderer (with browser tabs)
run-renderer:
	@echo "🚀 Starting frontend renderer on port 3334..."
	@cd ../../interactive-slide-sorcery && PORT=3334 npm exec tsx ssr/api-server.ts

# Run headless renderer (no browser tabs needed)
run-headless:
	@echo "🤖 Starting headless renderers..."
	@cd ../../interactive-slide-sorcery && npx tsx scripts/start-headless-renderers.ts --api-port 3334 --instances 4

# Simple headless setup (use existing npm scripts)
run-simple-headless:
	@echo "📦 First, start the renderer service in another terminal:"
	@echo "   cd ../../interactive-slide-sorcery && npm run puppet-server"
	@echo ""
	@echo "🚀 Starting backend server on port 9090..."
	@./venv/bin/python -m uvicorn api.chat_server:app --reload --host 0.0.0.0 --port 9090

# Kill all services (backend and renderer)
kill-all:
	@echo "🔪 Killing all services..."
	@echo "  Killing processes on ports..."
	@lsof -ti :9090 | xargs kill -9 2>/dev/null || true
	@lsof -ti :3334 | xargs kill -9 2>/dev/null || true
	@lsof -ti :8080 | xargs kill -9 2>/dev/null || true
	@echo "  Killing named processes..."
	@pkill -f "uvicorn" 2>/dev/null || true
	@pkill -f "tsx ssr/puppet.ts" 2>/dev/null || true
	@pkill -f "tsx ssr/api-server.ts" 2>/dev/null || true
	@pkill -f "npm run dev" 2>/dev/null || true
	@pkill -f "vite" 2>/dev/null || true
	@pkill -f "node.*vite" 2>/dev/null || true
	@pkill -f "interactive-slide-sorcery" 2>/dev/null || true
	@sleep 3
	@echo "  Checking for remaining processes..."
	@if lsof -ti :8080 >/dev/null 2>&1; then \
		echo "  ⚠️  Port 8080 still in use, forcing kill..."; \
		lsof -ti :8080 | xargs kill -9 2>/dev/null || true; \
		sleep 2; \
	fi
	@if lsof -ti :9090 >/dev/null 2>&1; then \
		echo "  ⚠️  Port 9090 still in use, forcing kill..."; \
		lsof -ti :9090 | xargs kill -9 2>/dev/null || true; \
		sleep 2; \
	fi
	@if lsof -ti :3334 >/dev/null 2>&1; then \
		echo "  ⚠️  Port 3334 still in use, forcing kill..."; \
		lsof -ti :3334 | xargs kill -9 2>/dev/null || true; \
		sleep 2; \
	fi
	@echo "✅ All services stopped"

# Force kill - more aggressive version
force-kill:
	@echo "💀 Force killing ALL Node.js and Python processes..."
	@pkill -9 -f node 2>/dev/null || true
	@pkill -9 -f python 2>/dev/null || true
	@pkill -9 -f uvicorn 2>/dev/null || true
	@lsof -ti :8080,:9090,:3334 | xargs kill -9 2>/dev/null || true
	@sleep 2
	@echo "✅ Force kill complete"

# Deploy to Render (with pre-deployment tests)
deploy: test
	@echo "📦 Deploying to Render..."
	@git add -A
	@git commit -m "Deploy: $(shell date +'%Y-%m-%d %H:%M:%S')" || true
	@git push origin ahmed/backend

# Clean cache files
clean:
	@echo "🧹 Cleaning cache files..."
	@find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	@find . -type f -name "*.pyc" -delete 2>/dev/null || true
	@find . -type f -name ".DS_Store" -delete 2>/dev/null || true
	@echo "✨ Clean!"

# Initialize registry from saved schemas
init-registry:
	@./venv/bin/python scripts/init_registry.py

# Check what's using our ports
check-ports:
	@echo "🔍 Checking port usage..."
	@echo "\nPort 8080 (Frontend):"
	@lsof -iTCP:8080 -sTCP:LISTEN 2>/dev/null || echo "  ✅ Port 8080 is free"
	@echo "\nPort 9090 (Backend API):"
	@lsof -iTCP:9090 -sTCP:LISTEN 2>/dev/null || echo "  ✅ Port 9090 is free"
	@echo "\nPort 3334 (Renderer API):"
	@lsof -iTCP:3334 -sTCP:LISTEN 2>/dev/null || echo "  ✅ Port 3334 is free"

# Run all services with verbose logging (for debugging)
run-all-verbose:
	@echo "🧹 Checking for port conflicts..."
	@if lsof -iTCP:9090 -sTCP:LISTEN >/dev/null 2>&1; then \
		echo "❌ Port 9090 is already in use. Run 'make kill-all' first."; \
		exit 1; \
	fi
	@if lsof -iTCP:8080 -sTCP:LISTEN >/dev/null 2>&1; then \
		echo "❌ Port 8080 is already in use. Run 'make kill-all' first."; \
		exit 1; \
	fi
	@if lsof -iTCP:3334 -sTCP:LISTEN >/dev/null 2>&1; then \
		echo "❌ Port 3334 is already in use. Run 'make kill-all' first."; \
		exit 1; \
	fi
	@echo "✅ All ports are available"
	@echo ""
	@echo "🚀 Starting backend server on port 9090..."
	@./venv/bin/python -m uvicorn api.chat_server:app --reload --host 0.0.0.0 --port 9090 &
	@sleep 3
	@echo "✅ Backend server started"
	@echo ""
	@echo "🌐 Starting frontend dev server on port 8080..."
	@cd ../../interactive-slide-sorcery && PORT=8080 npm run dev &
	@sleep 8
	@echo "✅ Frontend server started"
	@echo ""
	@echo "📦 Starting renderer API on port 3334..."
	@cd ../../interactive-slide-sorcery && PORT=3334 npx tsx ssr/api-server.ts &
	@sleep 3
	@echo "✅ Renderer API started"
	@echo ""
	@echo "🤖 Starting 4 headless Chrome instances..."
	@cd ../../interactive-slide-sorcery && npx tsx ssr/puppet.ts --url http://localhost:8080/renderer --instances 4 &
	@sleep 5
	@echo ""
	@echo "============================================================"
	@echo "✅ All services started successfully! (VERBOSE MODE)"
	@echo "============================================================"
	@echo ""
	@echo "📊 Services running on:"
	@echo "   - Backend API: http://localhost:9090"
	@echo "   - Frontend: http://localhost:8080"
	@echo "   - Renderer API: http://localhost:3334"
	@echo ""
	@echo "Press Ctrl+C to stop all services" 