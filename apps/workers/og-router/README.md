# OG Router - Cloudflare Worker

A Cloudflare Worker that handles bot detection at the edge for OG image sharing.

## How it Works

```
Share URL: nextslide.ai/p/{shortCode}
                    |
           Cloudflare Worker
                    |
         +---------+----------+
       Bot?                Regular User
         |                      |
   Proxy to backend         Proxy to frontend
   /api/public/meta/        (SPA)
   {shortCode}
         |
   Returns HTML with OG tags
   pointing to:
   api.nextslide.ai/api/public/og/{shortCode}.png
```

## Development

```bash
# Install dependencies
npm install

# Run locally
npm run dev

# Test with bot user agent
curl -A "Twitterbot" http://localhost:8787/p/testcode

# Test as regular user
curl http://localhost:8787/p/testcode
```

## Deployment

1. Install Wrangler CLI globally (if not already):
   ```bash
   npm install -g wrangler
   ```

2. Authenticate with Cloudflare:
   ```bash
   wrangler login
   ```

3. Deploy the worker:
   ```bash
   npm run deploy
   ```

4. Configure routes in Cloudflare Dashboard:
   - Go to Workers & Pages > og-router
   - Add route: `nextslide.ai/p/*`
   - Add route: `nextslide.ai/e/*`

## Configuration

Environment variables in `wrangler.toml`:

- `BACKEND_URL`: Backend API URL (default: `https://api.nextslide.ai`)
- `FRONTEND_URL`: Frontend app URL (default: `https://nextslide-frontend.onrender.com`)

## Testing

After deployment, verify with social media validators:
- Twitter: https://cards-dev.twitter.com/validator
- Facebook: https://developers.facebook.com/tools/debug/
- LinkedIn: https://www.linkedin.com/post-inspector/
