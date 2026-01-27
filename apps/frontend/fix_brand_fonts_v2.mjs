import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://iureiriffqcxrldisuqp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1cmVpcmlmZnFjeHJsZGlzdXFwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MjQ4OTcyNiwiZXhwIjoyMDU4MDY1NzI2fQ.O68WoyxbtfI6WgNWHD8IvD_6SbkyIt0A_E1flds_uZ8'
);

// Brand-specific font mappings - carefully curated for each brand's aesthetic
const BRAND_SPECIFIC_FONTS = {
  // Tech Giants - Modern, clean
  'apple.com': { title: 'Satoshi', body: 'Satoshi' },           // SF Pro → Satoshi (modern, clean)
  'google.com': { title: 'Outfit', body: 'Plus Jakarta Sans' }, // Product Sans → geometric, friendly
  'microsoft.com': { title: 'General Sans', body: 'General Sans' }, // Segoe UI → clean UI font
  'azure.microsoft.com': { title: 'General Sans', body: 'General Sans' },
  'outlook.com': { title: 'General Sans', body: 'General Sans' },
  'microsoftdynamics.com': { title: 'General Sans', body: 'General Sans' },

  // AI Companies - Contemporary, sophisticated
  'openai.com': { title: 'Geist', body: 'Geist' },              // OpenAI Sans → Geist (Vercel's modern grotesk)
  'anthropic.com': { title: 'Space Grotesk', body: 'Space Grotesk' }, // Styrene A → Space Grotesk

  // Fintech/Payments - Trust, modern
  'stripe.com': { title: 'Geist', body: 'Satoshi' },            // Söhne → Geist (very similar)
  'paypal.com': { title: 'Supreme', body: 'Supreme' },          // Supreme LL → Supreme (Fontshare)
  'square.com': { title: 'Space Grotesk', body: 'Bricolage Grotesque' },

  // Design Tools
  'figma.com': { title: 'General Sans', body: 'Switzer' },      // Figma Sans → clean UI fonts
  'gamma.app': { title: 'Sora', body: 'Plus Jakarta Sans' },
  'beautiful.ai': { title: 'Switzer', body: 'General Sans' },
  'slidebean.com': { title: 'Cabinet Grotesk', body: 'Switzer' },
  'trello.com': { title: 'Sora', body: 'Instrument Sans' },     // Charlie Display → Sora
  'n8n.io': { title: 'Outfit', body: 'Manrope' },               // Geomanist → Outfit
  'lovable.dev': { title: 'Sora', body: 'Plus Jakarta Sans' },

  // Streaming/Media
  'netflix.com': { title: 'Bebas Neue', body: 'Switzer' },      // Netflix Sans → Bebas Neue (bold condensed)
  'spotify.com': { title: 'DM Sans', body: 'DM Sans' },         // Spotify Circular → DM Sans (rounded)
  'twitch.tv': { title: 'Roobert', body: 'Roobert' },           // Roobert → We have it!
  'medium.com': { title: 'Young Serif', body: 'Sora' },         // GT Super → Young Serif (editorial)
  'audible.com': { title: 'Outfit', body: 'Sora' },

  // Social/Communication
  'slack.com': { title: 'Plus Jakarta Sans', body: 'Plus Jakarta Sans' },
  'meta-platforms.com': { title: 'Outfit', body: 'General Sans' },

  // Automotive - Clean, technical
  'tesla.com': { title: 'Outfit', body: 'Manrope' },            // Universal Sans → Outfit
  'rivian.com': { title: 'Barlow Condensed', body: 'Barlow' },  // Adventure → Barlow (already set)
  'porsche.com': { title: 'Outfit', body: 'Barlow' },           // Porsche Next → Outfit

  // Retail/Food - Friendly, approachable
  'mcdonalds.com': { title: 'Quicksand', body: 'Nunito' },      // Speedee → rounded, friendly
  'mcdonald.com': { title: 'Quicksand', body: 'Nunito' },
  'starbucks.com': { title: 'Sora', body: 'General Sans' },     // So Do Sans → Sora
  'coca-cola.com': { title: 'Urbanist', body: 'Archivo' },
  'pepsi.com': { title: 'Outfit', body: 'Outfit' },
  'target.com': { title: 'Outfit', body: 'Plus Jakarta Sans' },
  'kroger.com': { title: 'Nunito', body: 'General Sans' },
  'wegmans.com': { title: 'Instrument Serif', body: 'General Sans' }, // Miller Display → Instrument Serif
  'albertsons.com': { title: 'Nunito Sans', body: 'Nunito Sans' },
  'stopandshop.com': { title: 'Outfit', body: 'Plus Jakarta Sans' },
  'loblaws.ca': { title: 'General Sans', body: 'Switzer' },

  // Fast Food - Bold, energetic
  'tacobell.com': { title: 'League Spartan', body: 'Outfit' },
  'wendys.com': { title: 'Archivo Black', body: 'Open Sans' },
  'bk.com': { title: 'Bebas Neue', body: 'Outfit' },            // Flame → Bebas Neue
  'popeyes.com': { title: 'Switzer', body: 'Switzer' },
  'chipotle.com': { title: 'League Spartan', body: 'Nunito' },  // Trade Gothic → League Spartan
  'chick-fil-a.ca': { title: 'General Sans', body: 'Work Sans' }, // Apercu → General Sans
  'panerabread.com': { title: 'Clash Display', body: 'Sora' },

  // Sports/Entertainment
  'nike.com': { title: 'Switzer', body: 'Switzer' },            // Helvetica Neue → Switzer
  'nba.com': { title: 'Bebas Neue', body: 'Roboto' },           // Knockout Wide → Bebas Neue
  'fifa.com': { title: 'Outfit', body: 'General Sans' },
  'liverpoolfc.com': { title: 'Archivo Black', body: 'Outfit' },

  // Gaming/Entertainment
  'nintendo.com': { title: 'Quicksand', body: 'Nunito' },       // Museo Sans → Quicksand (rounded)
  'pokemon.com': { title: 'Outfit', body: 'Plus Jakarta Sans' },
  'pikachu.com': { title: 'Outfit', body: 'Roboto' },
  'blizzard.com': { title: 'Poppins', body: 'Archivo' },
  'dragonball.com': { title: 'Bebas Neue', body: 'Outfit' },
  'dragonballz.com': { title: 'Bebas Neue', body: 'Outfit' },
  'yugioh.com': { title: 'League Spartan', body: 'Arial' },
  'hasbro.com': { title: 'Outfit', body: 'General Sans' },
  'fortnitecreativehq.com': { title: 'Bebas Neue', body: 'Roboto' },

  // Luxury/Fashion
  'rolex.com': { title: 'Cabinet Grotesk', body: 'Switzer' },   // Helvetica Now → Cabinet Grotesk
  'drunkelephant.com': { title: 'Sora', body: 'Sentient' },     // Brown → Sora, Sentinel → Sentient

  // VC/Finance
  'sequoiacap.com': { title: 'Instrument Serif', body: 'Space Grotesk' }, // Rosart → Instrument Serif
  'bvp.com': { title: 'Young Serif', body: 'Sora' },            // Noe Display → Young Serif (editorial)
  'firstround.com': { title: 'General Sans', body: 'General Sans' },
  'firstroundcapital.com': { title: 'General Sans', body: 'General Sans' },
  'morganstanley.com': { title: 'Instrument Serif', body: 'General Sans' },
  'td.com': { title: 'Switzer', body: 'General Sans' },
  'citibank.com': { title: 'Outfit', body: 'Plus Jakarta Sans' },

  // Space/Tech
  'spacex.com': { title: 'Urbanist', body: 'Outfit' },          // Brandon Grotesque → Urbanist

  // Sales/Marketing
  'hubspot.com': { title: 'Outfit', body: 'Nunito' },           // Avenir Next → Outfit
  'salesforce.com': { title: 'Outfit', body: 'Plus Jakarta Sans' },
  'apollo.io': { title: 'Space Grotesk', body: 'Geist' },       // Founders Grotesk + Soehne
  'traackr.com': { title: 'Sentient', body: 'Nunito' },         // Recoleta → Sentient

  // Education
  'mit.edu': { title: 'Cabinet Grotesk', body: 'Switzer' },     // Neue Haas Grotesk → Cabinet Grotesk

  // Enterprise
  'ups.com': { title: 'Roboto', body: 'Roboto' },
  'sony.com': { title: 'Outfit', body: 'General Sans' },

  // Food Brands
  'oreo.com': { title: 'Fredoka', body: 'Nunito' },             // Pluto → Fredoka (playful rounded)
  'kitkat.com': { title: 'Archivo', body: 'General Sans' },

  // News/Media
  'nytimes.com': { title: 'Instrument Serif', body: 'General Sans' }, // NYT Franklin → editorial

  // Coffee Chains
  'circlek.com': { title: 'Outfit', body: 'Plus Jakarta Sans' },

  // Kids/Cartoon
  'sesamestreet.org': { title: 'Baloo 2', body: 'Source Sans Pro' },
  'southpark.cc.com': { title: 'Bangers', body: 'General Sans' },
  'cc.com': { title: 'Bangers', body: 'General Sans' },
  'seussville.com': { title: 'Fredoka', body: 'Quicksand' },
  'spongebobshop.com': { title: 'Fredoka', body: 'Nunito' },
  'tomandjerryonline.com': { title: 'Baloo 2', body: 'Quicksand' },

  // Misc Tech
  'instacart.com': { title: 'Playfair Display', body: 'Open Sans' }, // Keep the mix
  'ableton.com': { title: 'Poppins', body: 'Poppins' },         // Futura PT → Poppins
  'abc.xyz': { title: 'DM Sans', body: 'DM Sans' },             // Circular → DM Sans
  'primary.com': { title: 'Barlow Condensed', body: 'General Sans' }, // GT Alpina Condensed
  'howeye.com': { title: 'Poppins', body: 'Poppins' },          // Product Sans → Poppins
  'dyna.co': { title: 'Outfit', body: 'Inter' },
  'dyna.ai': { title: 'Outfit', body: 'Inter' },
  'dynarobotics.ai': { title: 'Outfit', body: 'Inter' },
  'datawizz.ai': { title: 'Outfit', body: 'General Sans' },

  // Charity/Non-profit
  'stjude.org': { title: 'Outfit', body: 'General Sans' },
  'unionsettlement.org': { title: 'League Spartan', body: 'Outfit' },

  // Government
  'nyc.gov': { title: 'Clash Display', body: 'Noto Sans' },
  'apra.gov.au': { title: 'Barlow', body: 'Public Sans' },
};

// Generic font substitutions for fonts not brand-specific
const FONT_STYLE_SUBSTITUTES = {
  // Contemporary Grotesks (Söhne, Graphik, Aktiv, etc.)
  'sohne': 'Geist',
  'söhne': 'Geist',
  'graphik': 'Switzer',
  'aktiv grotesk': 'General Sans',
  'apercu': 'General Sans',
  'circular': 'DM Sans',
  'calibre': 'Outfit',
  'basis grotesque': 'Work Sans',
  'founders grotesk': 'Space Grotesk',
  'gt america': 'Switzer',
  'maison neue': 'Satoshi',
  'suisse': 'Geist',
  'suisse intl': 'Geist',
  'post grotesk': 'Switzer',
  'clarkson': 'Bricolage Grotesque',
  'roobert': 'Roobert', // We have it!
  'geomanist': 'Outfit',
  'theinhardt': 'Switzer',

  // Classic Grotesks
  'neue haas grotesk': 'Cabinet Grotesk',
  'helvetica neue': 'Switzer',
  'helvetica now': 'Cabinet Grotesk',
  'univers': 'General Sans',
  'frutiger': 'Plus Jakarta Sans',

  // Geometric Sans
  'proxima nova': 'Outfit',
  'proxima': 'Outfit',
  'avenir': 'Nunito',
  'avenir next': 'Outfit',
  'futura': 'Poppins',
  'futura pt': 'Poppins',
  'gotham': 'Montserrat',
  'brandon grotesque': 'Urbanist',
  'brandon': 'Urbanist',
  'product sans': 'Outfit',
  'google sans': 'Outfit',
  'cereal': 'Quicksand',
  'airbnb cereal': 'Quicksand',
  'museo sans': 'Quicksand',
  'museo': 'Quicksand',

  // Tech/Product Sans
  'sf pro': 'Satoshi',
  'sf pro display': 'Satoshi',
  'sf pro text': 'Satoshi',
  'san francisco': 'Satoshi',
  'segoe ui': 'General Sans',
  'inter': 'Inter', // We have it!

  // Humanist Sans
  'gill sans': 'Lato',
  'myriad': 'Source Sans Pro',
  'acumin': 'Source Sans Pro',
  'din': 'Barlow',
  'din next': 'Barlow',
  'trade gothic': 'League Spartan',
  'interstate': 'Outfit',

  // Display/Editorial Serifs
  'noe display': 'Young Serif',
  'canela': 'Fraunces',
  'tiempos': 'Lora',
  'chronicle': 'Playfair Display',
  'miller': 'Instrument Serif',
  'gt super': 'Young Serif',
  'rosart': 'Instrument Serif',
  'freight': 'Source Serif Pro',
  'sentinel': 'Sentient',
  'recoleta': 'Sentient',

  // Classic Serifs
  'mercury': 'Libre Baskerville',
  'bodoni': 'Bodoni Moda',
  'didot': 'Playfair Display',

  // Condensed
  'knockout': 'Bebas Neue',
  'champion': 'Bebas Neue',
  'league gothic': 'League Spartan',
  'oswald': 'Oswald', // We have it!

  // Rounded/Friendly
  'nunito sans': 'Nunito Sans', // We have it!
  'varela': 'Varela Round',
  'quicksand': 'Quicksand', // We have it!

  // System fonts (CSS)
  'system-ui': 'General Sans',
  'ui-sans-serif': 'General Sans',
  '-apple-system': 'Satoshi',
  'sans-serif': 'General Sans',
  'var(': 'General Sans', // CSS variable fallback
};

function findBestSubstitute(fontName, brandDomain) {
  if (!fontName) return 'General Sans';

  // Check brand-specific first
  if (BRAND_SPECIFIC_FONTS[brandDomain]) {
    return null; // Will use brand-specific
  }

  const normalized = fontName.toLowerCase().trim();

  // Check font style substitutes
  for (const [pattern, substitute] of Object.entries(FONT_STYLE_SUBSTITUTES)) {
    if (normalized.includes(pattern)) {
      return substitute;
    }
  }

  // Fallback based on characteristics
  if (normalized.includes('serif') && !normalized.includes('sans')) {
    return 'Source Serif Pro';
  }
  if (normalized.includes('mono') || normalized.includes('code')) {
    return 'JetBrains Mono';
  }
  if (normalized.includes('display') || normalized.includes('headline')) {
    return 'Clash Display';
  }
  if (normalized.includes('condensed') || normalized.includes('narrow')) {
    return 'Barlow Condensed';
  }
  if (normalized.includes('rounded')) {
    return 'Quicksand';
  }
  if (normalized.includes('bold') || normalized.includes('black')) {
    return 'Archivo Black';
  }

  // Default to General Sans (clean, versatile)
  return 'General Sans';
}

console.log('=== Smart Brand Font Update v2 ===\n');

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
  const domain = brand.normalized_identifier;
  const fonts = brand.api_response?.fonts;

  let newTitle, newBody;

  // Check if we have brand-specific fonts
  if (BRAND_SPECIFIC_FONTS[domain]) {
    newTitle = BRAND_SPECIFIC_FONTS[domain].title;
    newBody = BRAND_SPECIFIC_FONTS[domain].body;
  } else if (fonts?.all) {
    // Use generic substitution
    const titleFont = fonts.all.find(f => f.type === 'title')?.name;
    const bodyFont = fonts.all.find(f => f.type === 'body')?.name;

    newTitle = findBestSubstitute(titleFont, domain);
    newBody = findBestSubstitute(bodyFont, domain);

    if (!newTitle && !newBody) {
      skipped++;
      continue;
    }

    newTitle = newTitle || 'General Sans';
    newBody = newBody || 'General Sans';
  } else {
    skipped++;
    continue;
  }

  // Update
  const updatedApiResponse = {
    ...brand.api_response,
    fonts: {
      all: [
        { name: newTitle, type: "title", style: "normal", origin: "google", weight: "600" },
        { name: newBody, type: "body", style: "normal", origin: "google", weight: "400" }
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

  if (!updateErr) {
    console.log(`✓ ${domain}: ${newTitle} / ${newBody}`);
    updated++;
  }
}

console.log(`\n✅ Updated ${updated} brands, skipped ${skipped}`);
