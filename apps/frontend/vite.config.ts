import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { SlideData } from "./src/types/SlideTypes";
import { CompleteDeckData } from "./src/types/DeckTypes";
import fs from 'fs';
import type { Connect, ViteDevServer } from 'vite';
import * as http from 'http';

// Define types for middleware functions
type MiddlewareRequest = Connect.IncomingMessage;
type MiddlewareResponse = http.ServerResponse;
type NextFunction = (err?: any) => void;

// Storage for mock slides data (in-memory during development)
let mockSlides: SlideData[] = [];
let mockDeck: CompleteDeckData | null = null;

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: '/',
  optimizeDeps: {
    include: ['xml2js']
  },
  server: {
    host: "::",
    port: 8080,
    proxy: {
      '/api/auth': {
        target: 'http://localhost:9090',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''), // Remove /api prefix for auth routes
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('Proxying auth:', req.method, req.url, '->', options.target + req.url);
          });
        }
      },
      '/api': {
        target: 'http://localhost:9090',
        changeOrigin: true,
        // Extend proxy/socket timeouts for long-running SSE requests
        // http-proxy options: timeout is for incoming request, proxyTimeout is for outgoing to target
        timeout: 600000, // 10 minutes
        proxyTimeout: 600000, // 10 minutes
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            // Only log non-health check requests to reduce noise
            if (!req.url?.includes('/health') && !req.url?.includes('/registry')) {
              console.log('Proxying:', req.method, req.url, '->', options.target + (req.url || ''));
            }
            const acceptHeader = Array.isArray((req.headers as any)?.accept)
              ? (req.headers as any).accept.join(',')
              : (req.headers as any)?.accept || '';
            const isSSE = acceptHeader?.includes('text/event-stream')
              || req.url?.includes('/compose-stream')
              || req.url?.includes('/openai/generate-outline-stream')
              || req.url?.includes('/deck/create-from-outline');
            if (isSSE) {
              proxyReq.setHeader('Connection', 'keep-alive');
              proxyReq.setHeader('Cache-Control', 'no-cache');
              proxyReq.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering
            }
          });
          proxy.on('proxyRes', (proxyRes, req, res) => {
            const acceptHeader = Array.isArray((req.headers as any)?.accept)
              ? (req.headers as any).accept.join(',')
              : (req.headers as any)?.accept || '';
            const isSSE = acceptHeader?.includes('text/event-stream')
              || req.url?.includes('/compose-stream')
              || req.url?.includes('/openai/generate-outline-stream')
              || req.url?.includes('/deck/create-from-outline');
            if (isSSE) {
              proxyRes.headers['cache-control'] = 'no-cache';
              proxyRes.headers['connection'] = 'keep-alive';
              proxyRes.headers['x-accel-buffering'] = 'no'; // Disable buffering
              delete proxyRes.headers['content-encoding'];
              delete proxyRes.headers['content-length'];
            }
          });
        }
      },
    },
  },
  plugins: [
    react(),
    // Custom plugin for mock endpoints (only in development)
    mode === 'development' && {
      name: 'mock-api',
      configureServer(server: ViteDevServer) {
        // Loosen Node HTTP server timeouts to better support long-lived SSE streams during development
        try {
          // Disable the legacy socket timeout behavior
          server.httpServer?.setTimeout?.(0);
          // Extend modern timeouts
          if (server.httpServer) {
            // @ts-ignore - properties exist at runtime on Node HTTP server
            server.httpServer.requestTimeout = 0; // disable request timeout
            // @ts-ignore
            server.httpServer.headersTimeout = 2 * 60 * 60 * 1000; // 2 hours
            // @ts-ignore
            server.httpServer.keepAliveTimeout = 2 * 60 * 60 * 1000; // 2 hours
          }
        } catch (e) {
          console.warn('Unable to relax dev server timeouts for SSE:', e);
        }
        // Load initial slides from local storage or file
        try {
          const localSlidesPath = path.resolve(__dirname, '.local-slides.json');
          if (fs.existsSync(localSlidesPath)) {
            const data = JSON.parse(fs.readFileSync(localSlidesPath, 'utf-8'));
            mockSlides = data.slides || [];
            mockDeck = data.deck || null;
            console.log('Loaded stored slides:', mockSlides.length);
          } else {
            // Initialize with empty slides array instead of importing from initialSlides
            mockSlides = [];
            console.log('Initialized with empty slides array');
          }
        } catch (error) {
          console.error('Error loading mock slides:', error);
        }

        // Save slides to local storage on server close
        server.httpServer?.on('close', () => {
          try {
            const localSlidesPath = path.resolve(__dirname, '.local-slides.json');
            fs.writeFileSync(localSlidesPath, JSON.stringify({ 
              slides: mockSlides,
              deck: mockDeck
            }, null, 2));
            console.log('Saved slides to local storage');
          } catch (error) {
            console.error('Error saving mock slides:', error);
          }
        });

        // Add middleware AFTER other middleware to let proxy handle real API calls first
        // This way, if the real backend is running, it will be used instead of mocks
        server.middlewares.use((req: Connect.IncomingMessage & { url?: string }, res: http.ServerResponse, next: Connect.NextFunction) => {
          // Skip mock endpoints if not an API route
          if (!req.url?.startsWith('/api/')) {
            return next();
          }

          // For now, let's bypass all mock endpoints and use the proxy
          // Comment out this line if you want to use mock endpoints
          return next();

          // Mock API endpoints code continues below (currently bypassed)...
        });
      }
    },
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@ssr": path.resolve(__dirname, "./ssr"),
      // Force single React version to avoid hook errors
      "react": path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
    },
    dedupe: ['react', 'react-dom'],
  },
}));
