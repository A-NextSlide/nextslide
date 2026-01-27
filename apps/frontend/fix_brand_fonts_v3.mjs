import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://iureiriffqcxrldisuqp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1cmVpcmlmZnFjeHJsZGlzdXFwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MjQ4OTcyNiwiZXhwIjoyMDU4MDY1NzI2fQ.O68WoyxbtfI6WgNWHD8IvD_6SbkyIt0A_E1flds_uZ8'
);

// Research-based brand font mappings
// Format: { title, body } - based on actual brand typography research
const BRAND_FONTS = {
  // TECH - Major platforms
  'stripe.com': { title: 'Switzer', body: 'Switzer' },           // Uses Söhne - Switzer is closest Swiss grotesque
  'apple.com': { title: 'General Sans', body: 'General Sans' }, // Uses SF Pro - General Sans is clean/neutral
  'google.com': { title: 'Outfit', body: 'Outfit' },            // Uses Product Sans - geometric rounded
  'microsoft.com': { title: 'Manrope', body: 'Manrope' },       // Uses Segoe UI - humanist sans
  'amazon.com': { title: 'Figtree', body: 'Figtree' },          // Uses Amazon Ember - friendly sans
  'meta.com': { title: 'Outfit', body: 'Outfit' },              // Uses Optimistic - geometric
  'facebook.com': { title: 'Outfit', body: 'Outfit' },

  // TECH - Developer/AI focused
  'openai.com': { title: 'Söhne', body: 'Söhne' },              // Actually uses Söhne, fallback to Switzer
  'anthropic.com': { title: 'Switzer', body: 'Switzer' },       // Clean tech aesthetic
  'github.com': { title: 'Manrope', body: 'Manrope' },          // Uses Mona Sans - humanist
  'vercel.com': { title: 'Geist', body: 'Geist' },              // Actually uses Geist!
  'linear.app': { title: 'Switzer', body: 'Switzer' },          // Uses Inter - but Switzer is closer to their vibe
  'figma.com': { title: 'Figtree', body: 'Figtree' },           // Uses custom - Figtree similar feel
  'notion.so': { title: 'Manrope', body: 'Manrope' },           // Uses Inter/custom blend
  'slack.com': { title: 'Switzer', body: 'Switzer' },           // Uses Lato - Switzer is more modern

  // CONSUMER TECH
  'netflix.com': { title: 'Bebas Neue', body: 'Switzer' },      // Netflix Sans is condensed display
  'spotify.com': { title: 'Cabinet Grotesk', body: 'Cabinet Grotesk' }, // Uses Circular - Cabinet similar
  'airbnb.com': { title: 'Cabinet Grotesk', body: 'Cabinet Grotesk' }, // Uses Cereal - rounded geometric
  'uber.com': { title: 'Barlow', body: 'Barlow' },              // Uses Uber Move - Barlow is close
  'lyft.com': { title: 'Sora', body: 'Sora' },                  // Uses Lyft Pro - geometric
  'twitch.tv': { title: 'Roobert', body: 'Roobert' },           // Uses Roobert!
  'discord.com': { title: 'Outfit', body: 'Outfit' },           // Uses gg sans - geometric rounded

  // FINTECH
  'paypal.com': { title: 'Manrope', body: 'Manrope' },          // Uses Helvetica - humanist alternative
  'square.com': { title: 'General Sans', body: 'General Sans' },// Clean geometric
  'plaid.com': { title: 'Switzer', body: 'Switzer' },           // Modern fintech
  'robinhood.com': { title: 'Cabinet Grotesk', body: 'Cabinet Grotesk' }, // Uses Capsule Sans
  'coinbase.com': { title: 'General Sans', body: 'General Sans' }, // Clean tech
  'wise.com': { title: 'Outfit', body: 'Outfit' },              // Modern geometric

  // E-COMMERCE
  'shopify.com': { title: 'Outfit', body: 'Outfit' },           // Modern ecommerce feel
  'etsy.com': { title: 'Cabinet Grotesk', body: 'Cabinet Grotesk' }, // Friendly rounded
  'ebay.com': { title: 'Figtree', body: 'Figtree' },            // Market/friendly

  // AUTOMOTIVE
  'rivian.com': { title: 'Barlow Condensed', body: 'Barlow' },  // Rugged/adventure
  'tesla.com': { title: 'General Sans', body: 'General Sans' }, // Clean minimal
  'ford.com': { title: 'Barlow', body: 'Barlow' },              // Traditional American
  'bmw.com': { title: 'Manrope', body: 'Manrope' },             // Premium
  'mercedes-benz.com': { title: 'Manrope', body: 'Manrope' },   // Luxury
  'porsche.com': { title: 'General Sans', body: 'General Sans' }, // Sporty clean

  // LUXURY/FASHION
  'nike.com': { title: 'Bebas Neue', body: 'Switzer' },         // Bold condensed + clean
  'adidas.com': { title: 'Bebas Neue', body: 'General Sans' },  // Bold + neutral
  'lululemon.com': { title: 'Outfit', body: 'Outfit' },         // Athletic modern
  'patagonia.com': { title: 'Barlow', body: 'Barlow' },         // Outdoor rugged
  'rei.com': { title: 'Barlow', body: 'Barlow' },               // Outdoor gear

  // MEDIA/ENTERTAINMENT
  'nytimes.com': { title: 'Instrument Serif', body: 'Source Serif Pro' }, // Editorial serif
  'medium.com': { title: 'Sora', body: 'Source Serif Pro' },    // Editorial mix
  'substack.com': { title: 'Sora', body: 'Source Serif Pro' },  // Newsletter feel
  'wired.com': { title: 'Space Grotesk', body: 'Space Grotesk' }, // Tech editorial
  'theverge.com': { title: 'Space Grotesk', body: 'Space Grotesk' }, // Tech media

  // SAAS/BUSINESS
  'salesforce.com': { title: 'Outfit', body: 'Outfit' },        // Enterprise friendly
  'hubspot.com': { title: 'Outfit', body: 'Outfit' },           // Marketing/CRM
  'mailchimp.com': { title: 'Cabinet Grotesk', body: 'Cabinet Grotesk' }, // Friendly rounded
  'intercom.com': { title: 'Outfit', body: 'Outfit' },          // Customer service
  'zendesk.com': { title: 'Outfit', body: 'Outfit' },           // Support platform
  'asana.com': { title: 'Sora', body: 'Sora' },                 // Project management
  'monday.com': { title: 'Outfit', body: 'Outfit' },            // Colorful/friendly
  'airtable.com': { title: 'Sora', body: 'Sora' },              // Modern database
  'dropbox.com': { title: 'Sora', body: 'Sora' },               // Clean modern
  'atlassian.com': { title: 'Outfit', body: 'Outfit' },         // Developer tools
  'zoom.us': { title: 'Outfit', body: 'Outfit' },               // Video conferencing

  // FOOD/DELIVERY
  'doordash.com': { title: 'Cabinet Grotesk', body: 'Cabinet Grotesk' }, // Friendly delivery
  'ubereats.com': { title: 'Barlow', body: 'Barlow' },          // Uber family
  'instacart.com': { title: 'Cabinet Grotesk', body: 'Cabinet Grotesk' }, // Grocery friendly
  'grubhub.com': { title: 'Cabinet Grotesk', body: 'Cabinet Grotesk' }, // Food delivery
  'seamless.com': { title: 'Cabinet Grotesk', body: 'Cabinet Grotesk' },

  // TRAVEL
  'booking.com': { title: 'Outfit', body: 'Outfit' },           // Travel friendly
  'expedia.com': { title: 'Outfit', body: 'Outfit' },           // Travel
  'tripadvisor.com': { title: 'Outfit', body: 'Outfit' },       // Reviews
  'kayak.com': { title: 'Sora', body: 'Sora' },                 // Search focused

  // SOCIAL
  'twitter.com': { title: 'General Sans', body: 'General Sans' }, // Clean social
  'x.com': { title: 'General Sans', body: 'General Sans' },     // Same as Twitter
  'linkedin.com': { title: 'Manrope', body: 'Manrope' },        // Professional
  'tiktok.com': { title: 'Sora', body: 'Sora' },                // Youthful modern
  'instagram.com': { title: 'General Sans', body: 'General Sans' }, // Clean social
  'pinterest.com': { title: 'Cabinet Grotesk', body: 'Cabinet Grotesk' }, // Creative friendly
  'reddit.com': { title: 'Outfit', body: 'Outfit' },            // Community
  'snapchat.com': { title: 'Outfit', body: 'Outfit' },          // Youthful

  // HEALTHCARE/WELLNESS
  'peloton.com': { title: 'Bebas Neue', body: 'Switzer' },      // Fitness bold
  'headspace.com': { title: 'Cabinet Grotesk', body: 'Cabinet Grotesk' }, // Calm/friendly
  'calm.com': { title: 'Cabinet Grotesk', body: 'Cabinet Grotesk' }, // Meditation
  'fitbit.com': { title: 'Sora', body: 'Sora' },                // Health tech

  // EDUCATION
  'coursera.org': { title: 'Sora', body: 'Source Serif Pro' },  // Educational
  'udemy.com': { title: 'Outfit', body: 'Outfit' },             // Learning platform
  'duolingo.com': { title: 'Outfit', body: 'Outfit' },          // Friendly learning
  'khanacademy.org': { title: 'Sora', body: 'Sora' },           // Educational

  // GAMING
  'playstation.com': { title: 'Sora', body: 'Sora' },           // Gaming
  'xbox.com': { title: 'Manrope', body: 'Manrope' },            // Microsoft family
  'nintendo.com': { title: 'Outfit', body: 'Outfit' },          // Friendly gaming
  'steam.com': { title: 'Sora', body: 'Sora' },                 // PC gaming
  'epicgames.com': { title: 'Space Grotesk', body: 'Space Grotesk' }, // Gaming tech
  'roblox.com': { title: 'Outfit', body: 'Outfit' },            // Kids gaming

  // NEWS/PUBLISHING
  'washingtonpost.com': { title: 'Young Serif', body: 'Source Serif Pro' }, // News serif
  'bbc.com': { title: 'Manrope', body: 'Manrope' },             // News sans
  'cnn.com': { title: 'Manrope', body: 'Manrope' },             // News
  'bloomberg.com': { title: 'Space Grotesk', body: 'Space Grotesk' }, // Financial news
  'forbes.com': { title: 'Young Serif', body: 'Source Serif Pro' }, // Business

  // HARDWARE
  'dell.com': { title: 'Manrope', body: 'Manrope' },            // Enterprise hardware
  'hp.com': { title: 'Manrope', body: 'Manrope' },              // Hardware
  'lenovo.com': { title: 'Outfit', body: 'Outfit' },            // Consumer tech
  'samsung.com': { title: 'Sora', body: 'Sora' },               // Modern electronics
  'sony.com': { title: 'Sora', body: 'Sora' },                  // Electronics
  'lg.com': { title: 'Outfit', body: 'Outfit' },                // Appliances

  // CLOUD/INFRASTRUCTURE
  'aws.amazon.com': { title: 'Figtree', body: 'Figtree' },      // Amazon family
  'cloud.google.com': { title: 'Outfit', body: 'Outfit' },      // Google family
  'azure.microsoft.com': { title: 'Manrope', body: 'Manrope' }, // Microsoft family
  'digitalocean.com': { title: 'Sora', body: 'Sora' },          // Developer focused
  'heroku.com': { title: 'Sora', body: 'Sora' },                // Developer
  'cloudflare.com': { title: 'Sora', body: 'Sora' },            // Infrastructure
  'datadog.com': { title: 'Space Grotesk', body: 'Space Grotesk' }, // Monitoring

  // DESIGN TOOLS
  'adobe.com': { title: 'General Sans', body: 'General Sans' }, // Creative suite
  'canva.com': { title: 'Cabinet Grotesk', body: 'Cabinet Grotesk' }, // Friendly design
  'sketch.com': { title: 'Switzer', body: 'Switzer' },          // Design tool
  'invisionapp.com': { title: 'Sora', body: 'Sora' },           // Design collaboration
  'miro.com': { title: 'Outfit', body: 'Outfit' },              // Whiteboard
  'framer.com': { title: 'Switzer', body: 'Switzer' },          // Design/dev

  // CONSULTING/PROFESSIONAL
  'mckinsey.com': { title: 'Young Serif', body: 'Source Serif Pro' }, // Traditional consulting
  'bcg.com': { title: 'Young Serif', body: 'Source Serif Pro' }, // Consulting
  'bain.com': { title: 'Young Serif', body: 'Source Serif Pro' }, // Consulting
  'deloitte.com': { title: 'Manrope', body: 'Manrope' },        // Professional services
  'pwc.com': { title: 'Manrope', body: 'Manrope' },             // Professional services
  'accenture.com': { title: 'Outfit', body: 'Outfit' },         // Tech consulting

  // BANKING/FINANCE
  'chase.com': { title: 'Manrope', body: 'Manrope' },           // Traditional bank
  'bankofamerica.com': { title: 'Manrope', body: 'Manrope' },   // Traditional bank
  'wellsfargo.com': { title: 'Manrope', body: 'Manrope' },      // Traditional bank
  'capitalone.com': { title: 'Sora', body: 'Sora' },            // Modern bank
  'americanexpress.com': { title: 'Manrope', body: 'Manrope' }, // Premium financial
  'visa.com': { title: 'Manrope', body: 'Manrope' },            // Payment network
  'mastercard.com': { title: 'Outfit', body: 'Outfit' },        // Modern payment
};

// Font category mapping for fallbacks based on industry/style
const INDUSTRY_FONTS = {
  // Tech/SaaS defaults - clean and modern
  tech: { title: 'Switzer', body: 'Switzer' },
  saas: { title: 'Outfit', body: 'Outfit' },

  // Consumer/Friendly - rounded, approachable
  consumer: { title: 'Cabinet Grotesk', body: 'Cabinet Grotesk' },

  // Editorial/Publishing - serif for credibility
  editorial: { title: 'Young Serif', body: 'Source Serif Pro' },

  // Enterprise/Corporate - professional
  enterprise: { title: 'Manrope', body: 'Manrope' },

  // Gaming/Entertainment - bold and dynamic
  gaming: { title: 'Sora', body: 'Sora' },

  // Outdoor/Adventure - sturdy
  outdoor: { title: 'Barlow', body: 'Barlow' },

  // Fitness/Sports - bold display
  fitness: { title: 'Bebas Neue', body: 'Switzer' },

  // Finance - trustworthy
  finance: { title: 'Manrope', body: 'Manrope' },

  // Default - versatile modern
  default: { title: 'Outfit', body: 'Outfit' }
};

// Keywords to detect industry
const INDUSTRY_KEYWORDS = {
  tech: ['software', 'cloud', 'api', 'developer', 'code', 'ai', 'ml', 'data'],
  saas: ['platform', 'service', 'subscription', 'management', 'automation'],
  consumer: ['shop', 'store', 'market', 'delivery', 'food', 'grocery'],
  editorial: ['news', 'media', 'magazine', 'journal', 'publish', 'blog'],
  enterprise: ['enterprise', 'business', 'corporate', 'consulting', 'bank'],
  gaming: ['game', 'gaming', 'esports', 'play'],
  outdoor: ['outdoor', 'adventure', 'hiking', 'camping', 'sports'],
  fitness: ['fitness', 'gym', 'workout', 'health', 'wellness'],
  finance: ['bank', 'finance', 'invest', 'trading', 'insurance', 'payment']
};

// Available fonts in our system
const AVAILABLE_FONTS = new Set([
  // Fontshare premium
  'Satoshi', 'Cabinet Grotesk', 'General Sans', 'Clash Display', 'Switzer',
  'Ranade', 'Panchang', 'Melodrama', 'Erode', 'Sentient', 'Synonym', 'Supreme',
  'Array', 'Bonny', 'Pilcrow Rounded', 'Britney', 'Roobert', 'Geist',

  // Google quality picks
  'Outfit', 'Sora', 'Manrope', 'Figtree', 'Space Grotesk', 'Plus Jakarta Sans',
  'DM Sans', 'Instrument Sans', 'Bricolage Grotesque', 'Albert Sans',

  // Display/Bold
  'Bebas Neue', 'Barlow', 'Barlow Condensed', 'Oswald',

  // Serif
  'Young Serif', 'Instrument Serif', 'Source Serif Pro', 'Playfair Display',
  'Lora', 'Merriweather', 'EB Garamond', 'Cormorant Garamond',

  // Standards
  'Inter', 'Roboto', 'Open Sans', 'Lato', 'Poppins', 'Montserrat',
  'Work Sans', 'Nunito', 'Raleway'
]);

function isAvailable(fontName) {
  if (!fontName) return false;
  return AVAILABLE_FONTS.has(fontName);
}

function detectIndustry(brand) {
  const searchText = (brand.normalized_identifier + ' ' + (brand.api_response?.description || '')).toLowerCase();

  for (const [industry, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
    if (keywords.some(kw => searchText.includes(kw))) {
      return industry;
    }
  }
  return 'default';
}

function getBrandFonts(brand) {
  const identifier = brand.normalized_identifier?.toLowerCase() || '';

  // Check for exact domain match
  for (const [domain, fonts] of Object.entries(BRAND_FONTS)) {
    if (identifier.includes(domain.replace('.com', '').replace('.org', '').replace('.tv', '').replace('.us', '').replace('.app', '').replace('.so', ''))) {
      return fonts;
    }
  }

  // Fallback to industry-based fonts
  const industry = detectIndustry(brand);
  return INDUSTRY_FONTS[industry] || INDUSTRY_FONTS.default;
}

console.log('=== Brand Font Update v3 - Research-Based ===\n');

// Get all brands
const { data: brands, error } = await supabase
  .from('brandfetch_cache')
  .select('id, normalized_identifier, api_response')
  .order('hit_count', { ascending: false });

if (error) {
  console.log('Error:', error.message);
  process.exit(1);
}

console.log(`Found ${brands.length} brands\n`);

let updated = 0;
let skipped = 0;

for (const brand of brands) {
  const fonts = brand.api_response?.fonts;
  if (!fonts?.names) continue;

  // Check if current fonts are available
  const currentTitle = fonts.all?.find(f => f.type === 'title')?.name;
  const currentBody = fonts.all?.find(f => f.type === 'body')?.name;

  const titleAvailable = isAvailable(currentTitle);
  const bodyAvailable = isAvailable(currentBody);

  // Skip if both fonts are already available
  if (titleAvailable && bodyAvailable) {
    skipped++;
    continue;
  }

  // Get recommended fonts for this brand
  const recommended = getBrandFonts(brand);

  // Use current font if available, otherwise use recommendation
  const newTitle = titleAvailable ? currentTitle : recommended.title;
  const newBody = bodyAvailable ? currentBody : recommended.body;

  // Update the api_response
  const updatedApiResponse = {
    ...brand.api_response,
    fonts: {
      all: [
        {
          name: newTitle,
          type: 'title',
          style: 'normal',
          origin: 'google',
          weight: '600'
        },
        {
          name: newBody,
          type: 'body',
          style: 'normal',
          origin: 'google',
          weight: '400'
        }
      ],
      names: [newTitle, newBody],
      primary: [newTitle],
      secondary: [newBody]
    }
  };

  const { error: updateErr } = await supabase
    .from('brandfetch_cache')
    .update({ api_response: updatedApiResponse })
    .eq('id', brand.id);

  if (updateErr) {
    console.log(`Error updating ${brand.normalized_identifier}: ${updateErr.message}`);
  } else {
    console.log(`${brand.normalized_identifier}: ${currentTitle || 'none'}/${currentBody || 'none'} -> ${newTitle}/${newBody}`);
    updated++;
  }
}

console.log(`\n=== Done ===`);
console.log(`Updated: ${updated}`);
console.log(`Skipped (already have available fonts): ${skipped}`);
