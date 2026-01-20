/**
 * Cloudflare Worker for OG Image Bot Detection and Routing
 *
 * This worker intercepts share URLs (/p/{shortCode} and /e/{shortCode}) and:
 * - For bots (social media crawlers): Proxies to backend for OG meta tags HTML
 * - For regular users: Proxies to frontend SPA
 */

const BOT_PATTERNS = [
  // Generic bot patterns
  'bot', 'crawl', 'spider', 'preview', 'fetch', 'curl', 'wget', 'http',

  // Social media
  'facebook', 'facebookexternalhit', 'facebookcatalog',  // Facebook, Messenger, Instagram
  'twitter', 'twitterbot',
  'linkedin', 'linkedinbot',
  'pinterest', 'pinterestbot',
  'reddit', 'redditbot',
  'tumblr',

  // Messaging apps
  'slack', 'slackbot',
  'discord', 'discordbot',
  'whatsapp',
  'telegram', 'telegrambot',
  'skype', 'skypeuripreview',
  'viber',
  'line',
  'kakaotalk', 'kakao',
  'wechat',
  'signal',
  'snapchat',
  'imessage',
  'messenger',

  // Work/Productivity tools
  'teams', 'microsoft teams',
  'zoom',
  'notion',
  'confluence',
  'jira',
  'asana',
  'trello',
  'monday',
  'clickup',
  'basecamp',

  // Search engines
  'googlebot', 'google',
  'bingbot', 'bing',
  'yandex',
  'duckduckbot',
  'baiduspider', 'baidu',
  'sogou',
  'exabot',
  'ia_archiver',

  // Link preview services
  'embedly', 'embed',
  'quora',
  'outbrain',
  'vkshare', 'vk.com',
  'applebot',
  'rogerbot',
  'showyoubot',
  'opengraph',
  'ifttt',
  'zapier',

  // News/RSS
  'feedly',
  'flipboard',
  'newsblur',
  'inoreader',
];

/**
 * Check if the user agent belongs to a bot/crawler
 * @param {string} userAgent
 * @returns {boolean}
 */
function isBot(userAgent) {
  const ua = (userAgent || '').toLowerCase();
  return BOT_PATTERNS.some(pattern => ua.includes(pattern));
}

export default {
  /**
   * Handle incoming requests
   * @param {Request} request
   * @param {Object} env - Environment variables
   * @returns {Promise<Response>}
   */
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Check if this is a share route: /p/{shortCode} or /e/{shortCode}
    const match = pathname.match(/^\/(p|e)\/([a-zA-Z0-9]+)$/);

    if (match) {
      const userAgent = request.headers.get('user-agent') || '';
      const shortCode = match[2];
      const shareType = match[1]; // 'p' for view, 'e' for edit

      console.log(`[OG-Router] Request for /${shareType}/${shortCode}, UA: ${userAgent.substring(0, 50)}...`);

      if (isBot(userAgent)) {
        console.log(`[OG-Router] Bot detected, fetching OG meta from backend`);

        // Fetch OG meta HTML from backend
        const backendUrl = env.BACKEND_URL || 'https://api.nextslide.ai';
        const metaUrl = `${backendUrl}/api/public/meta/${shortCode}`;

        try {
          const metaResponse = await fetch(metaUrl, {
            headers: {
              'User-Agent': userAgent,
              'X-Forwarded-For': request.headers.get('cf-connecting-ip') || '',
            }
          });

          if (metaResponse.ok) {
            const html = await metaResponse.text();
            return new Response(html, {
              status: 200,
              headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
                'X-Robots-Tag': 'noindex', // Don't index the meta page
              },
            });
          } else {
            console.log(`[OG-Router] Backend returned ${metaResponse.status}, falling through to frontend`);
          }
        } catch (error) {
          console.error(`[OG-Router] Error fetching from backend: ${error.message}`);
        }
      }
    }

    // For non-share routes or regular users, proxy to frontend
    const frontendUrl = env.FRONTEND_URL || 'https://nextslide-frontend.onrender.com';
    const targetUrl = new URL(request.url);
    targetUrl.hostname = new URL(frontendUrl).hostname;
    targetUrl.protocol = 'https:';
    targetUrl.port = '';

    console.log(`[OG-Router] Proxying to frontend: ${targetUrl.toString()}`);

    // Clone the request with the new URL
    const modifiedRequest = new Request(targetUrl.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'follow',
    });

    try {
      const response = await fetch(modifiedRequest);

      // Return the response with CORS headers
      const newResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });

      return newResponse;
    } catch (error) {
      console.error(`[OG-Router] Error proxying to frontend: ${error.message}`);
      return new Response('Service temporarily unavailable', { status: 503 });
    }
  },
};
