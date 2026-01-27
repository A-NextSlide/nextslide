import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://iureiriffqcxrldisuqp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1cmVpcmlmZnFjeHJsZGlzdXFwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MjQ4OTcyNiwiZXhwIjoyMDU4MDY1NzI2fQ.O68WoyxbtfI6WgNWHD8IvD_6SbkyIt0A_E1flds_uZ8'
);

// Available fonts in our system (from fonts.ts)
const AVAILABLE_FONTS = new Set([
  // Awwwards Picks
  'HK Grotesk Wide', 'Geist', 'Satoshi', 'Cabinet Grotesk', 'General Sans',
  'Clash Display', 'Switzer', 'Ranade', 'Panchang', 'Melodrama', 'Erode',
  'Sentient', 'Synonym', 'Supreme', 'Array', 'Bonny', 'Pilcrow Rounded', 'Britney',

  // Designer
  'Eudoxus Sans', 'Gloock', 'Prata', 'Staatliches', 'Baloo 2',

  // System
  'Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Georgia',
  'Verdana', 'Impact', 'Tahoma', 'Trebuchet MS', 'Comic Sans MS',

  // Sans-Serif Google
  'Roboto', 'Open Sans', 'Lato', 'Nunito', 'Raleway', 'Work Sans', 'Outfit',
  'Manrope', 'Sora', 'Plus Jakarta Sans', 'DM Sans', 'Figtree', 'Space Grotesk',
  'Instrument Sans', 'Bricolage Grotesque', 'Familjen Grotesk', 'Schibsted Grotesk',
  'Onest', 'Noto Sans', 'Albert Sans', 'Hanken Grotesk', 'Metropolis',
  'Be Vietnam Pro', 'Unbounded', 'Darker Grotesque', 'Wix Madefor Display',
  'Wix Madefor Text', 'Readex Pro', 'Anybody', 'Gabarito', 'Anek Latin',
  'Golos Text', 'League Spartan', 'Spline Sans', 'Sofia Sans', 'Archivo Narrow',
  'Syne', 'Chivo Mono', 'Inter', 'Poppins', 'Montserrat', 'Source Sans Pro',
  'PT Sans', 'Oswald', 'Quicksand', 'Barlow', 'Barlow Condensed', 'Titillium Web',
  'Karla', 'Cabin', 'Arimo', 'Fira Sans', 'Exo 2', 'Heebo', 'Asap',
  'Overpass', 'Signika', 'Catamaran', 'Varela Round', 'Assistant', 'Questrial',
  'Prompt', 'Public Sans', 'Red Hat Display', 'Lexend',

  // Serif Google
  'PT Serif', 'Source Serif Pro', 'Libre Baskerville', 'Crimson Text',
  'Noto Serif', 'Bitter', 'Literata', 'Newsreader', 'Vollkorn', 'Cardo',
  'Gentium Plus', 'Old Standard TT', 'Unna', 'Domine', 'Instrument Serif',
  'DM Serif Text', 'DM Serif Display', 'Roboto Serif', 'Young Serif',
  'Fraunces', 'Eczar', 'Petrona', 'Mate', 'Cormorant', 'Cormorant Garamond',
  'EB Garamond', 'Lora', 'Merriweather', 'Playfair Display', 'Libre Caslon Text',
  'Bodoni Moda', 'Spectral',

  // Display
  'Abril Fatface', 'Alfa Slab One', 'Righteous', 'Pacifico', 'Lobster',
  'Permanent Marker', 'Satisfy', 'Caveat', 'Dancing Script', 'Great Vibes',
  'Kaushan Script', 'Sacramento', 'Cookie', 'Yellowtail', 'Allura',
  'Courgette', 'Amatic SC', 'Shadows Into Light', 'Indie Flower',
  'Patrick Hand', 'Architects Daughter', 'Kalam', 'Handlee', 'Neucha',
  'Gloria Hallelujah', 'Coming Soon', 'Rock Salt', 'Reenie Beanie',

  // Monospace
  'Fira Code', 'JetBrains Mono', 'Source Code Pro', 'IBM Plex Mono',
  'Roboto Mono', 'Ubuntu Mono', 'Inconsolata', 'Space Mono', 'Overpass Mono',
  'Anonymous Pro', 'Cousine', 'PT Mono', 'Cutive Mono', 'Share Tech Mono',
]);

// Font substitution map for common unavailable fonts
const FONT_SUBSTITUTES = {
  // Custom/proprietary fonts -> best available match
  'adventure': 'Barlow Condensed',
  'söhne': 'Inter',
  'sohne': 'Inter',
  'neue haas grotesk': 'Helvetica',
  'helvetica neue': 'Helvetica',
  'sf pro': 'Inter',
  'sf pro display': 'Inter',
  'sf pro text': 'Inter',
  'san francisco': 'Inter',
  'proxima nova': 'Montserrat',
  'avenir': 'Nunito',
  'avenir next': 'Nunito',
  'futura': 'Poppins',
  'gotham': 'Montserrat',
  'brandon grotesque': 'Raleway',
  'circular': 'DM Sans',
  'graphik': 'Inter',
  'apercu': 'Work Sans',
  'aktiv grotesk': 'Inter',
  'acumin': 'Source Sans Pro',
  'din': 'Barlow',
  'din next': 'Barlow',
  'trade gothic': 'Oswald',
  'univers': 'Open Sans',
  'frutiger': 'Open Sans',
  'myriad': 'Source Sans Pro',
  'gill sans': 'Lato',
  'museo sans': 'Nunito',
  'brandon': 'Raleway',
  'sentinel': 'Merriweather',
  'chronicle': 'Playfair Display',
  'mercury': 'Libre Baskerville',
  'miller': 'Cormorant Garamond',
  'canela': 'Playfair Display',
  'tiempos': 'Lora',
  'freight': 'Source Serif Pro',
  'noe display': 'Playfair Display',
  'product sans': 'Poppins',
  'google sans': 'Poppins',
  'cereal': 'Nunito',
  'airbnb cereal': 'Nunito',
  'uber move': 'Barlow',
  'move': 'Barlow',
  'spotify circular': 'DM Sans',
  'netflix sans': 'Bebas Neue',
  'apple garamond': 'EB Garamond',
  'neue helvetica': 'Helvetica',
  'plak': 'Oswald',
  'basis grotesque': 'Work Sans',
  'founders grotesk': 'Space Grotesk',
  'gt america': 'Inter',
  'gt walsheim': 'Poppins',
  'maison neue': 'DM Sans',
  'neuzeit': 'Roboto',
  'suisse': 'Inter',
  'suisse intl': 'Inter',
  'theinhardt': 'Roboto',
  'abc favorit': 'Work Sans',
  'favorit': 'Work Sans',
  'larsseit': 'Nunito',
  'Mark Pro': 'Inter',
  'mark pro': 'Inter',
};

function normalizeFont(font) {
  return font.toLowerCase().trim();
}

function isAvailable(fontName) {
  if (!fontName) return false;
  const normalized = fontName.trim();
  // Check exact match
  if (AVAILABLE_FONTS.has(normalized)) return true;
  // Check case-insensitive
  for (const f of AVAILABLE_FONTS) {
    if (f.toLowerCase() === normalized.toLowerCase()) return true;
  }
  return false;
}

function findSubstitute(fontName) {
  if (!fontName) return 'Inter';
  const normalized = normalizeFont(fontName);

  // Check direct substitute
  if (FONT_SUBSTITUTES[normalized]) {
    return FONT_SUBSTITUTES[normalized];
  }

  // Check partial matches
  for (const [key, sub] of Object.entries(FONT_SUBSTITUTES)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return sub;
    }
  }

  // Default fallback based on font characteristics
  if (normalized.includes('serif') && !normalized.includes('sans')) {
    return 'Source Serif Pro';
  }
  if (normalized.includes('mono') || normalized.includes('code')) {
    return 'JetBrains Mono';
  }
  if (normalized.includes('display') || normalized.includes('headline')) {
    return 'Space Grotesk';
  }
  if (normalized.includes('condensed') || normalized.includes('narrow')) {
    return 'Barlow Condensed';
  }

  // Default to Inter (most versatile)
  return 'Inter';
}

console.log('=== Auditing Brand Fonts ===\n');

// Get all brands
const { data: brands, error } = await supabase
  .from('brandfetch_cache')
  .select('id, normalized_identifier, api_response')
  .order('hit_count', { ascending: false });

if (error) {
  console.log('Error:', error.message);
  process.exit(1);
}

console.log(`Found ${brands.length} brands in cache\n`);

const brandsToUpdate = [];

for (const brand of brands) {
  const fonts = brand.api_response?.fonts;
  if (!fonts?.names || fonts.names.length === 0) continue;

  const unavailableFonts = [];
  const fontUpdates = { title: null, body: null };

  for (const fontEntry of (fonts.all || [])) {
    const fontName = fontEntry?.name;
    if (!fontName) continue;

    if (!isAvailable(fontName)) {
      unavailableFonts.push(fontName);
      const substitute = findSubstitute(fontName);

      if (fontEntry.type === 'title') {
        fontUpdates.title = substitute;
      } else if (fontEntry.type === 'body') {
        fontUpdates.body = substitute;
      }
    }
  }

  if (unavailableFonts.length > 0) {
    brandsToUpdate.push({
      id: brand.id,
      identifier: brand.normalized_identifier,
      currentFonts: fonts.names,
      unavailable: unavailableFonts,
      suggestedTitle: fontUpdates.title || findSubstitute(unavailableFonts[0]),
      suggestedBody: fontUpdates.body || findSubstitute(unavailableFonts[unavailableFonts.length > 1 ? 1 : 0]),
      apiResponse: brand.api_response
    });
  }
}

console.log(`\n=== Brands with Unavailable Fonts: ${brandsToUpdate.length} ===\n`);

for (const brand of brandsToUpdate) {
  console.log(`${brand.identifier}:`);
  console.log(`  Current: ${brand.currentFonts.join(', ')}`);
  console.log(`  Unavailable: ${brand.unavailable.join(', ')}`);
  console.log(`  Suggested: Title=${brand.suggestedTitle}, Body=${brand.suggestedBody}`);
  console.log('');
}

// Ask for confirmation before updating
console.log('\n=== Ready to update ===');
console.log(`Will update ${brandsToUpdate.length} brands with available font substitutes.`);

// Perform updates
let updated = 0;
for (const brand of brandsToUpdate) {
  const updatedApiResponse = {
    ...brand.apiResponse,
    fonts: {
      all: [
        {
          name: brand.suggestedTitle,
          type: "title",
          style: "normal",
          origin: "google",
          weight: "600"
        },
        {
          name: brand.suggestedBody,
          type: "body",
          style: "normal",
          origin: "google",
          weight: "400"
        }
      ],
      names: [brand.suggestedTitle, brand.suggestedBody],
      primary: [brand.suggestedTitle],
      secondary: [brand.suggestedBody]
    }
  };

  const { error: updateErr } = await supabase
    .from('brandfetch_cache')
    .update({ api_response: updatedApiResponse })
    .eq('id', brand.id);

  if (updateErr) {
    console.log(`❌ Error updating ${brand.identifier}: ${updateErr.message}`);
  } else {
    updated++;
  }
}

console.log(`\n✅ Updated ${updated}/${brandsToUpdate.length} brands`);
