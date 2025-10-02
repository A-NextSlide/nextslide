/**
 * Font Definitions Library for TypeBox Registry
 * 
 * This file defines the available fonts and their categories.
 */

/**
 * Font Definition interface
 */
import { UNBLAST_LOCAL_FONTS } from './unblast-local';

export interface FontDefinition {
  name: string;
  family: string;
  source: 'system' | 'google' | 'local' | 'fontshare' | 'cdn' | 'designer';
  weight?: string | number;
  style?: string;
  url?: string;
}

/**
 * Font Categories with their font definitions
 */
export const FONT_CATEGORIES: Record<string, FontDefinition[]> = {
  // Awwwards curated set – high-quality, designer-forward free fonts
  'Awwwards Picks': [
    // Locally bundled display sans used across the app
    { name: 'HK Grotesk Wide', family: 'HK Grotesk Wide', source: 'system', weight: '300 400 500 600 700 800 900' },
    // Vercel Geist – official CDN stylesheet
    { name: 'Geist', family: 'Geist', source: 'cdn', weight: '100 200 300 400 500 600 700 800 900', url: 'https://geistfont.vercel.app/geist.css' },
    // Fontshare designer staples
    { name: 'Satoshi', family: 'Satoshi', source: 'fontshare', weight: '300 400 500 700 900' },
    { name: 'Cabinet Grotesk', family: 'Cabinet Grotesk', source: 'fontshare', weight: '400 500 700 800 900' },
    { name: 'General Sans', family: 'General Sans', source: 'fontshare', weight: '300 400 500 600 700' },
    { name: 'Clash Display', family: 'Clash Display', source: 'fontshare', weight: '400 500 600 700' },
    { name: 'Switzer', family: 'Switzer', source: 'fontshare', weight: '300 400 500 600 700 800 900' },
    { name: 'Ranade', family: 'Ranade', source: 'fontshare', weight: '300 400 500 700' },
    { name: 'Panchang', family: 'Panchang', source: 'fontshare', weight: '300 400 500 600 700 800' },
    { name: 'Melodrama', family: 'Melodrama', source: 'fontshare', weight: '300 400 500 600 700' },
    { name: 'Erode', family: 'Erode', source: 'fontshare', weight: '300 400 500 600 700' },
    { name: 'Sentient', family: 'Sentient', source: 'fontshare', weight: '300 400 500 700' },
    { name: 'Synonym', family: 'Synonym', source: 'fontshare', weight: '300 400 500 600 700' },
    { name: 'Supreme', family: 'Supreme', source: 'fontshare', weight: '300 400 500 700 800' },
    { name: 'Array', family: 'Array', source: 'fontshare', weight: '400 500 700' },
    { name: 'Bonny', family: 'Bonny', source: 'fontshare', weight: '400 500 700' },
    { name: 'Pilcrow Rounded', family: 'Pilcrow Rounded', source: 'fontshare', weight: '400 500 600 700' },
    { name: 'Britney', family: 'Britney', source: 'fontshare', weight: '300 400 500 600 700' }
  ],
  
  // Designer set – curated + local additions
  'Designer': [
    { name: 'Eudoxus Sans', family: 'Eudoxus Sans', source: 'google', weight: '400 500 600 700 800' },
    { name: 'Gloock', family: 'Gloock', source: 'google', weight: '400' },
    { name: 'Prata', family: 'Prata', source: 'google', weight: '400' },
    { name: 'Staatliches', family: 'Staatliches', source: 'google', weight: '400' },
    { name: 'Baloo 2', family: 'Baloo 2', source: 'google', weight: '400 500 600 700 800' }
  ],
  
  // Local designer fonts added from public/fonts via generator
  'Designer Local': [
    ...UNBLAST_LOCAL_FONTS
  ],
  // System & Web Safe fonts
  'System & Web Safe': [
    { name: 'Arial', family: 'Arial', source: 'system' },
    { name: 'Helvetica', family: 'Helvetica', source: 'system' },
    { name: 'Times New Roman', family: 'Times New Roman', source: 'system' },
    { name: 'Courier New', family: 'Courier New', source: 'system' },
    { name: 'Georgia', family: 'Georgia', source: 'system' },
    { name: 'Verdana', family: 'Verdana', source: 'system' },
    { name: 'Impact', family: 'Impact', source: 'system' },
    { name: 'Tahoma', family: 'Tahoma', source: 'system' },
    { name: 'Trebuchet MS', family: 'Trebuchet MS', source: 'system' },
    { name: 'Comic Sans MS', family: 'Comic Sans MS', source: 'system' }
  ],
  
  // Sans-Serif Google fonts
  'Sans-Serif': [
    { name: 'Roboto', family: 'Roboto', source: 'google', weight: '300 400 500 700 900' },
    { name: 'Open Sans', family: 'Open Sans', source: 'google', weight: '300 400 500 600 700 800' },
    { name: 'Lato', family: 'Lato', source: 'google', weight: '300 400 700 900' },
    { name: 'Nunito', family: 'Nunito', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Raleway', family: 'Raleway', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Work Sans', family: 'Work Sans', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Outfit', family: 'Outfit', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Manrope', family: 'Manrope', source: 'google', weight: '300 400 500 600 700 800' },
    { name: 'Sora', family: 'Sora', source: 'google', weight: '300 400 500 600 700 800' },
    { name: 'Plus Jakarta Sans', family: 'Plus Jakarta Sans', source: 'google', weight: '300 400 500 600 700 800' },
    { name: 'DM Sans', family: 'DM Sans', source: 'google', weight: '400 500 700' },
    { name: 'Figtree', family: 'Figtree', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Geist', family: 'Geist', source: 'cdn', weight: '100 200 300 400 500 600 700 800 900', url: 'https://geistfont.vercel.app/geist.css' },
    { name: 'Space Grotesk', family: 'Space Grotesk', source: 'google', weight: '300 400 500 600 700' },
    // New 2024 Google Fonts releases
    { name: 'Instrument Sans', family: 'Instrument Sans', source: 'google', weight: '400 500 600 700' },
    { name: 'Bricolage Grotesque', family: 'Bricolage Grotesque', source: 'google', weight: '300 400 500 600 700 800' },
    { name: 'Familjen Grotesk', family: 'Familjen Grotesk', source: 'google', weight: '400 500 600 700' },
    { name: 'Schibsted Grotesk', family: 'Schibsted Grotesk', source: 'google', weight: '400 500 600 700 800 900' },
    { name: 'Onest', family: 'Onest', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Noto Sans', family: 'Noto Sans', source: 'google', weight: '300 400 500 600 700 800 900' },
    // Additional premium sans-serifs
    { name: 'Albert Sans', family: 'Albert Sans', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Hanken Grotesk', family: 'Hanken Grotesk', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Metropolis', family: 'Metropolis', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Be Vietnam Pro', family: 'Be Vietnam Pro', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Unbounded', family: 'Unbounded', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Darker Grotesque', family: 'Darker Grotesque', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Wix Madefor Display', family: 'Wix Madefor Display', source: 'google', weight: '400 500 600 700 800' },
    { name: 'Wix Madefor Text', family: 'Wix Madefor Text', source: 'google', weight: '400 500 600 700 800' },
    { name: 'Readex Pro', family: 'Readex Pro', source: 'google', weight: '300 400 500 600 700' },
    { name: 'Anybody', family: 'Anybody', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Gabarito', family: 'Gabarito', source: 'google', weight: '400 500 600 700 800 900' },
    { name: 'Anek Latin', family: 'Anek Latin', source: 'google', weight: '300 400 500 600 700 800' },
    { name: 'Golos Text', family: 'Golos Text', source: 'google', weight: '400 500 600 700 800 900' },
    { name: 'League Spartan', family: 'League Spartan', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Spline Sans', family: 'Spline Sans', source: 'google', weight: '300 400 500 600 700' },
    { name: 'Sofia Sans', family: 'Sofia Sans', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Archivo Narrow', family: 'Archivo Narrow', source: 'google', weight: '400 500 600 700' },
    { name: 'Syne', family: 'Syne', source: 'google', weight: '400 500 600 700 800' },
    { name: 'Chivo Mono', family: 'Chivo Mono', source: 'google', weight: '300 400 500 600 700' },
    // Unblast additions (Google)
    { name: 'Eudoxus Sans', family: 'Eudoxus Sans', source: 'google', weight: '400 500 600 700 800' }
  ],
  
  // Serif Google fonts
  'Serif': [
    { name: 'PT Serif', family: 'PT Serif', source: 'google', weight: '400 700' },
    { name: 'Source Serif Pro', family: 'Source Serif Pro', source: 'google', weight: '300 400 600 700 900' },
    { name: 'Libre Baskerville', family: 'Libre Baskerville', source: 'google', weight: '400 700' },
    { name: 'Crimson Text', family: 'Crimson Text', source: 'google', weight: '400 600 700' },
    { name: 'Noto Serif', family: 'Noto Serif', source: 'google', weight: '400 700' },
    { name: 'Bitter', family: 'Bitter', source: 'google', weight: '300 400 500 600 700 800' },
    { name: 'Literata', family: 'Literata', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Newsreader', family: 'Newsreader', source: 'google', weight: '300 400 500 600 700 800' },
    { name: 'Vollkorn', family: 'Vollkorn', source: 'google', weight: '400 500 600 700 800 900' },
    { name: 'Cardo', family: 'Cardo', source: 'google', weight: '400 700' },
    { name: 'Gentium Plus', family: 'Gentium Plus', source: 'google', weight: '400 700' },
    { name: 'Old Standard TT', family: 'Old Standard TT', source: 'google', weight: '400 700' },
    { name: 'Unna', family: 'Unna', source: 'google', weight: '400 700' },
    { name: 'Domine', family: 'Domine', source: 'google', weight: '400 500 600 700' },
    // New 2024 serif releases
    { name: 'Instrument Serif', family: 'Instrument Serif', source: 'google', weight: '400' },
    { name: 'DM Serif Text', family: 'DM Serif Text', source: 'google', weight: '400' },
    { name: 'DM Serif Display', family: 'DM Serif Display', source: 'google', weight: '400' },
    { name: 'Roboto Serif', family: 'Roboto Serif', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Young Serif', family: 'Young Serif', source: 'google', weight: '400' },
    { name: 'Fraunces', family: 'Fraunces', source: 'google', weight: '300 400 500 600 700 800 900' },
    // Additional premium serifs
    { name: 'Eczar', family: 'Eczar', source: 'google', weight: '400 500 600 700 800' },
    { name: 'Petrona', family: 'Petrona', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Mate', family: 'Mate', source: 'google', weight: '400' },
    { name: 'Mate SC', family: 'Mate SC', source: 'google', weight: '400' },
    { name: 'Ibarra Real Nova', family: 'Ibarra Real Nova', source: 'google', weight: '400 500 600 700' },
    { name: 'Bellefair', family: 'Bellefair', source: 'google', weight: '400' },
    { name: 'Halant', family: 'Halant', source: 'google', weight: '300 400 500 600 700' },
    { name: 'Gelasio', family: 'Gelasio', source: 'google', weight: '400 500 600 700' },
    { name: 'BioRhyme', family: 'BioRhyme', source: 'google', weight: '300 400 700 800' },
    { name: 'Castoro', family: 'Castoro', source: 'google', weight: '400' },
    { name: 'Marcellus', family: 'Marcellus', source: 'google', weight: '400' },
    { name: 'Marcellus SC', family: 'Marcellus SC', source: 'google', weight: '400' },
    { name: 'Alice', family: 'Alice', source: 'google', weight: '400' },
    { name: 'Piazzolla', family: 'Piazzolla', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Suwannaphum', family: 'Suwannaphum', source: 'google', weight: '300 400 700 900' },
    { name: 'Radley', family: 'Radley', source: 'google', weight: '400' },
    { name: 'Podkova', family: 'Podkova', source: 'google', weight: '400 500 600 700 800' },
    { name: 'Hahmlet', family: 'Hahmlet', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Linden Hill', family: 'Linden Hill', source: 'google', weight: '400' },
    { name: 'Rosarivo', family: 'Rosarivo', source: 'google', weight: '400' },
    // Unblast addition
    { name: 'Prata', family: 'Prata', source: 'google', weight: '400' }
  ],
  
  // Monospace Google fonts
  'Monospace': [
    { name: 'Roboto Mono', family: 'Roboto Mono', source: 'google', weight: '300 400 500 600 700' },
    { name: 'Source Code Pro', family: 'Source Code Pro', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Fira Code', family: 'Fira Code', source: 'google', weight: '300 400 500 600 700' },
    { name: 'JetBrains Mono', family: 'JetBrains Mono', source: 'google', weight: '300 400 500 600 700 800' },
    { name: 'Space Mono', family: 'Space Mono', source: 'google', weight: '400 700' },
    { name: 'PT Mono', family: 'PT Mono', source: 'google', weight: '400' },
    { name: 'IBM Plex Mono', family: 'IBM Plex Mono', source: 'google', weight: '300 400 500 600 700' },
    { name: 'Ubuntu Mono', family: 'Ubuntu Mono', source: 'google', weight: '400 700' },
    { name: 'Inconsolata', family: 'Inconsolata', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Courier Prime', family: 'Courier Prime', source: 'google', weight: '400 700' },
    { name: 'Red Hat Mono', family: 'Red Hat Mono', source: 'google', weight: '300 400 500 600 700' },
    { name: 'Overpass Mono', family: 'Overpass Mono', source: 'google', weight: '300 400 600 700' },
    // New monospace additions
    { name: 'Azeret Mono', family: 'Azeret Mono', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Martian Mono', family: 'Martian Mono', source: 'google', weight: '300 400 500 600 700 800' },
    { name: 'Commit Mono', family: 'Commit Mono', source: 'google', weight: '400 500 600 700' }
  ],
  
  // Bold & Impact fonts (high quality)
  'Bold': [
    { name: 'Bebas Neue', family: 'Bebas Neue', source: 'google', weight: '400' },
    { name: 'Anton', family: 'Anton', source: 'google', weight: '400' },
    { name: 'Archivo Black', family: 'Archivo Black', source: 'google', weight: '400' },
    { name: 'Black Ops One', family: 'Black Ops One', source: 'google', weight: '400' },
    { name: 'Orbitron', family: 'Orbitron', source: 'google', weight: '400 500 600 700 800 900' },
    { name: 'Oswald', family: 'Oswald', source: 'google', weight: '300 400 500 600 700' },
    { name: 'Alfa Slab One', family: 'Alfa Slab One', source: 'google', weight: '400' },
    { name: 'Russo One', family: 'Russo One', source: 'google', weight: '400' },
    { name: 'Bungee', family: 'Bungee', source: 'google', weight: '400' },
    { name: 'Titan One', family: 'Titan One', source: 'google', weight: '400' },
    { name: 'Ultra', family: 'Ultra', source: 'google', weight: '400' },
    { name: 'Fredoka', family: 'Fredoka', source: 'google', weight: '300 400 500 600 700' },
    { name: 'Squada One', family: 'Squada One', source: 'google', weight: '400' },
    { name: 'Passion One', family: 'Passion One', source: 'google', weight: '400 700 900' },
    { name: 'Bangers', family: 'Bangers', source: 'google', weight: '400' },
    // New bold additions
    { name: 'Bowlby One', family: 'Bowlby One', source: 'google', weight: '400' },
    { name: 'Righteous', family: 'Righteous', source: 'google', weight: '400' },
    { name: 'Fugaz One', family: 'Fugaz One', source: 'google', weight: '400' },
    // Unblast addition
    { name: 'Staatliches', family: 'Staatliches', source: 'google', weight: '400' }
  ],
  
  // Design Google fonts
  'Design': [
    { name: 'Montserrat Alternates', family: 'Montserrat Alternates', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Comfortaa', family: 'Comfortaa', source: 'google', weight: '300 400 500 600 700' },
    { name: 'Quicksand', family: 'Quicksand', source: 'google', weight: '300 400 500 600 700' },
    { name: 'Josefin Sans', family: 'Josefin Sans', source: 'google', weight: '300 400 500 600 700' },
    { name: 'Cabin', family: 'Cabin', source: 'google', weight: '400 500 600 700' },
    { name: 'Barlow', family: 'Barlow', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Varela Round', family: 'Varela Round', source: 'google', weight: '400' },
    { name: 'Calistoga', family: 'Calistoga', source: 'google', weight: '400' },
    { name: 'Rubik', family: 'Rubik', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Chivo', family: 'Chivo', source: 'google', weight: '300 400 700 900' },
    { name: 'Karla', family: 'Karla', source: 'google', weight: '300 400 500 600 700 800' },
    { name: 'Mulish', family: 'Mulish', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Exo 2', family: 'Exo 2', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Lexend', family: 'Lexend', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Urbanist', family: 'Urbanist', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Epilogue', family: 'Epilogue', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Red Hat Display', family: 'Red Hat Display', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Commissioner', family: 'Commissioner', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Barlow Condensed', family: 'Barlow Condensed', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Archivo', family: 'Archivo', source: 'google', weight: '300 400 500 600 700 800 900' },
    // More creative design fonts
    { name: 'Heebo', family: 'Heebo', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Overpass', family: 'Overpass', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Hind', family: 'Hind', source: 'google', weight: '300 400 500 600 700' },
    { name: 'Fira Sans', family: 'Fira Sans', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Oxygen', family: 'Oxygen', source: 'google', weight: '300 400 700' },
    { name: 'Asap', family: 'Asap', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Catamaran', family: 'Catamaran', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Muli', family: 'Muli', source: 'google', weight: '300 400 500 600 700 800 900' },
    // New design additions
    { name: 'Nunito Sans', family: 'Nunito Sans', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Spartan', family: 'Spartan', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Jost', family: 'Jost', source: 'google', weight: '300 400 500 600 700 800 900' },
    // Additional premium design fonts
    { name: 'Signika', family: 'Signika', source: 'google', weight: '300 400 500 600 700' },
    { name: 'Signika Negative', family: 'Signika Negative', source: 'google', weight: '300 400 500 600 700' },
    { name: 'Encode Sans', family: 'Encode Sans', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Encode Sans Expanded', family: 'Encode Sans Expanded', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Assistant', family: 'Assistant', source: 'google', weight: '300 400 500 600 700 800' },
    { name: 'Lekton', family: 'Lekton', source: 'google', weight: '400 700' },
    { name: 'Bai Jamjuree', family: 'Bai Jamjuree', source: 'google', weight: '300 400 500 600 700' },
    { name: 'Chakra Petch', family: 'Chakra Petch', source: 'google', weight: '300 400 500 600 700' },
    { name: 'Saira', family: 'Saira', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Saira Semi Condensed', family: 'Saira Semi Condensed', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Public Sans', family: 'Public Sans', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Aleo', family: 'Aleo', source: 'google', weight: '300 400 700' },
    { name: 'Inria Sans', family: 'Inria Sans', source: 'google', weight: '300 400 700' },
    { name: 'Inria Serif', family: 'Inria Serif', source: 'google', weight: '300 400 700' },
    { name: 'Kantumruy Pro', family: 'Kantumruy Pro', source: 'google', weight: '300 400 500 600 700' },
    { name: 'Niramit', family: 'Niramit', source: 'google', weight: '300 400 500 600 700' },
    { name: 'Sarabun', family: 'Sarabun', source: 'google', weight: '300 400 500 600 700 800' },
    { name: 'Tajawal', family: 'Tajawal', source: 'google', weight: '300 400 500 700 800 900' },
    { name: 'Athiti', family: 'Athiti', source: 'google', weight: '300 400 500 600 700' },
    // Unblast addition (Playful rounded)
    { name: 'Baloo 2', family: 'Baloo 2', source: 'google', weight: '400 500 600 700 800' }
  ],
  
  // Script & Handwritten fonts (high quality)
  'Script': [
    { name: 'Caveat', family: 'Caveat', source: 'google', weight: '400 500 600 700' },
    { name: 'Dancing Script', family: 'Dancing Script', source: 'google', weight: '400 500 600 700' },
    { name: 'Kaushan Script', family: 'Kaushan Script', source: 'google', weight: '400' },
    { name: 'Great Vibes', family: 'Great Vibes', source: 'google', weight: '400' },
    { name: 'Allura', family: 'Allura', source: 'google', weight: '400' },
    { name: 'Pacifico', family: 'Pacifico', source: 'google', weight: '400' },
    { name: 'Satisfy', family: 'Satisfy', source: 'google', weight: '400' },
    { name: 'Courgette', family: 'Courgette', source: 'google', weight: '400' },
    { name: 'Amatic SC', family: 'Amatic SC', source: 'google', weight: '400 700' },
    { name: 'Indie Flower', family: 'Indie Flower', source: 'google', weight: '400' },
    { name: 'Shadows Into Light', family: 'Shadows Into Light', source: 'google', weight: '400' },
    { name: 'Patrick Hand', family: 'Patrick Hand', source: 'google', weight: '400' },
    { name: 'Lobster', family: 'Lobster', source: 'google', weight: '400' },
    { name: 'Permanent Marker', family: 'Permanent Marker', source: 'google', weight: '400' },
    { name: 'Handlee', family: 'Handlee', source: 'google', weight: '400' },
    // New script additions
    { name: 'Sacramento', family: 'Sacramento', source: 'google', weight: '400' },
    { name: 'Tangerine', family: 'Tangerine', source: 'google', weight: '400 700' },
    { name: 'Yellowtail', family: 'Yellowtail', source: 'google', weight: '400' },
    { name: 'Kalam', family: 'Kalam', source: 'google', weight: '300 400 700' }
  ],
  
  // Elegant & Decorative fonts (high quality)
  'Elegant': [
    { name: 'Playfair Display', family: 'Playfair Display', source: 'google', weight: '400 500 600 700 800 900' },
    { name: 'Cormorant Garamond', family: 'Cormorant Garamond', source: 'google', weight: '300 400 500 600 700' },
    { name: 'Cinzel', family: 'Cinzel', source: 'google', weight: '400 500 600 700 800 900' },
    { name: 'Yeseva One', family: 'Yeseva One', source: 'google', weight: '400' },
    { name: 'Abril Fatface', family: 'Abril Fatface', source: 'google', weight: '400' },
    { name: 'Righteous', family: 'Righteous', source: 'google', weight: '400' },
    { name: 'Fjalla One', family: 'Fjalla One', source: 'google', weight: '400' },
    { name: 'Alegreya', family: 'Alegreya', source: 'google', weight: '400 500 600 700 800 900' },
    { name: 'Spectral', family: 'Spectral', source: 'google', weight: '300 400 500 600 700 800' },
    { name: 'EB Garamond', family: 'EB Garamond', source: 'google', weight: '400 500 600 700 800' },
    { name: 'Crimson Pro', family: 'Crimson Pro', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Bungee Inline', family: 'Bungee Inline', source: 'google', weight: '400' },
    { name: 'Audiowide', family: 'Audiowide', source: 'google', weight: '400' },
    { name: 'Monoton', family: 'Monoton', source: 'google', weight: '400' },
    // New elegant additions
    { name: 'Cormorant', family: 'Cormorant', source: 'google', weight: '300 400 500 600 700' },
    { name: 'Libre Caslon Text', family: 'Libre Caslon Text', source: 'google', weight: '400 700' },
    { name: 'Zilla Slab', family: 'Zilla Slab', source: 'google', weight: '300 400 500 600 700' },
    // Unblast addition (display serif)
    { name: 'Gloock', family: 'Gloock', source: 'google', weight: '400' }
  ],
  
  // Premium & Professional fonts
  'Premium': [
    { name: 'Inter', family: 'Inter', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Poppins', family: 'Poppins', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Montserrat', family: 'Montserrat', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Playfair Display', family: 'Playfair Display', source: 'google', weight: '400 500 600 700 800 900' },
    { name: 'Source Sans Pro', family: 'Source Sans Pro', source: 'google', weight: '300 400 600 700 900' },
    { name: 'Lora', family: 'Lora', source: 'google', weight: '400 500 600 700' },
    { name: 'Merriweather', family: 'Merriweather', source: 'google', weight: '300 400 700 900' },
    { name: 'Roboto Slab', family: 'Roboto Slab', source: 'google', weight: '300 400 500 600 700 800 900' }
  ],
  
  // Variable Fonts - New category for modern variable fonts
  'Variable': [
    { name: 'Inter Variable', family: 'Inter', source: 'google', weight: '100 900', style: 'variable' },
    { name: 'Roboto Flex', family: 'Roboto Flex', source: 'google', weight: '100 1000', style: 'variable' },
    { name: 'Outfit Variable', family: 'Outfit', source: 'google', weight: '100 900', style: 'variable' },
    { name: 'Manrope Variable', family: 'Manrope', source: 'google', weight: '200 800', style: 'variable' },
    { name: 'Sora Variable', family: 'Sora', source: 'google', weight: '100 800', style: 'variable' },
    { name: 'Fraunces Variable', family: 'Fraunces', source: 'google', weight: '100 900', style: 'variable' }
  ],
  
  // Contemporary - New category for modern trending fonts
  'Contemporary': [
    { name: 'Instrument Sans', family: 'Instrument Sans', source: 'google', weight: '400 500 600 700' },
    { name: 'Bricolage Grotesque', family: 'Bricolage Grotesque', source: 'google', weight: '300 400 500 600 700 800' },
    { name: 'Familjen Grotesk', family: 'Familjen Grotesk', source: 'google', weight: '400 500 600 700' },
    { name: 'Schibsted Grotesk', family: 'Schibsted Grotesk', source: 'google', weight: '400 500 600 700 800 900' },
    { name: 'Onest', family: 'Onest', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Young Serif', family: 'Young Serif', source: 'google', weight: '400' },
    { name: 'Instrument Serif', family: 'Instrument Serif', source: 'google', weight: '400' },
    { name: 'Martian Mono', family: 'Martian Mono', source: 'google', weight: '300 400 500 600 700 800' },
    // High-quality variable fonts with unique characteristics
    { name: 'Science Gothic', family: 'Science Gothic', source: 'google', weight: '100 200 300 400 500 600 700 800 900' },
    { name: 'Commissioner', family: 'Commissioner', source: 'google', weight: '100 200 300 400 500 600 700 800 900' },
    { name: 'Recursive', family: 'Recursive', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Anybody', family: 'Anybody', source: 'google', weight: '100 200 300 400 500 600 700 800 900' }
  ],
  
  // Unique & Experimental fonts - Distinctive typefaces with character
  'Unique': [
    { name: 'Orbitron', family: 'Orbitron', source: 'google', weight: '400 500 600 700 800 900' },
    { name: 'Exo 2', family: 'Exo 2', source: 'google', weight: '100 200 300 400 500 600 700 800 900' },
    { name: 'Audiowide', family: 'Audiowide', source: 'google', weight: '400' },
    { name: 'Electrolize', family: 'Electrolize', source: 'google', weight: '400' },
    { name: 'Michroma', family: 'Michroma', source: 'google', weight: '400' },
    { name: 'Saira Condensed', family: 'Saira Condensed', source: 'google', weight: '100 200 300 400 500 600 700 800 900' },
    { name: 'Saira Extra Condensed', family: 'Saira Extra Condensed', source: 'google', weight: '100 200 300 400 500 600 700 800 900' },
    { name: 'Teko', family: 'Teko', source: 'google', weight: '300 400 500 600 700' },
    { name: 'Pathway Gothic One', family: 'Pathway Gothic One', source: 'google', weight: '400' },
    { name: 'Aldrich', family: 'Aldrich', source: 'google', weight: '400' },
    { name: 'Jura', family: 'Jura', source: 'google', weight: '300 400 500 600 700' },
    { name: 'Quantico', family: 'Quantico', source: 'google', weight: '400 700' }
  ],
  
  // Fontshare fonts - Premium quality free fonts
  'Modern': [
    { name: 'Satoshi', family: 'Satoshi', source: 'fontshare', weight: '300 400 500 700 900' },
    { name: 'Cabinet Grotesk', family: 'Cabinet Grotesk', source: 'fontshare', weight: '400 500 700 800 900' },
    { name: 'General Sans', family: 'General Sans', source: 'fontshare', weight: '300 400 500 600 700' },
    { name: 'Clash Display', family: 'Clash Display', source: 'fontshare', weight: '400 500 600 700' },
    { name: 'Chillax', family: 'Chillax', source: 'fontshare', weight: '300 400 500 600 700' },
    { name: 'Boska', family: 'Boska', source: 'fontshare', weight: '400 500 700' },
    { name: 'Gambarino', family: 'Gambarino', source: 'fontshare', weight: '400' },
    { name: 'Switzer', family: 'Switzer', source: 'fontshare', weight: '300 400 500 600 700 800 900' },
    { name: 'Ranade', family: 'Ranade', source: 'fontshare', weight: '300 400 500 700' },
    { name: 'Panchang', family: 'Panchang', source: 'fontshare', weight: '300 400 500 600 700 800' },
    { name: 'Melodrama', family: 'Melodrama', source: 'fontshare', weight: '300 400 500 600 700' },
    { name: 'Erode', family: 'Erode', source: 'fontshare', weight: '300 400 500 600 700' },
    { name: 'Sentient', family: 'Sentient', source: 'fontshare', weight: '300 400 500 700' },
    { name: 'Synonym', family: 'Synonym', source: 'fontshare', weight: '300 400 500 600 700' },
    { name: 'Supreme', family: 'Supreme', source: 'fontshare', weight: '300 400 500 700 800' },
    { name: 'Author', family: 'Author', source: 'fontshare', weight: '300 400 500 600 700' },
    { name: 'Bespoke Serif', family: 'Bespoke Serif', source: 'fontshare', weight: '300 400 500 600 700' },
    { name: 'Stardom', family: 'Stardom', source: 'fontshare', weight: '400 500 700' },
    { name: 'Nippo', family: 'Nippo', source: 'fontshare', weight: '300 400 500 700' },
    { name: 'Zodiak', family: 'Zodiak', source: 'fontshare', weight: '400 700 900' },
    // Additional Fontshare fonts
    { name: 'Khand', family: 'Khand', source: 'fontshare', weight: '300 400 500 600 700' },
    { name: 'Telma', family: 'Telma', source: 'fontshare', weight: '400 500 600 700 800' },
    { name: 'Satoshi Variable', family: 'Satoshi', source: 'fontshare', weight: '300 400 500 600 700 800 900' },
    { name: 'Bonny', family: 'Bonny', source: 'fontshare', weight: '400 500 700' },
    { name: 'Plein', family: 'Plein', source: 'fontshare', weight: '400 500 700' },
    { name: 'Sharpie', family: 'Sharpie', source: 'fontshare', weight: '400 500 700' },
    { name: 'Tanker', family: 'Tanker', source: 'fontshare', weight: '400' },
    { name: 'Wremena', family: 'Wremena', source: 'fontshare', weight: '300 400 700' },
    { name: 'Kola', family: 'Kola', source: 'fontshare', weight: '300 400 500' },
    { name: 'Roobert', family: 'Roobert', source: 'fontshare', weight: '300 400 500 600 700' },
    { name: 'Azeret', family: 'Azeret', source: 'fontshare', weight: '300 400 500 600 700 800 900' },
    { name: 'Pilcrow Rounded', family: 'Pilcrow Rounded', source: 'fontshare', weight: '400 500 600 700' },
    { name: 'Array', family: 'Array', source: 'fontshare', weight: '400 500 700' },
    { name: 'Britney', family: 'Britney', source: 'fontshare', weight: '300 400 500 600 700' },
    { name: 'Hoover', family: 'Hoover', source: 'fontshare', weight: '400 500 600 700' }
  ],
  
  // Editorial & Magazine fonts
  'Editorial': [
    { name: 'Bodoni Moda', family: 'Bodoni Moda', source: 'google', weight: '400 500 600 700 800 900' },
    { name: 'Rozha One', family: 'Rozha One', source: 'google', weight: '400' },
    { name: 'Oranienbaum', family: 'Oranienbaum', source: 'google', weight: '400' },
    { name: 'Arvo', family: 'Arvo', source: 'google', weight: '400 700' },
    { name: 'Slabo 27px', family: 'Slabo 27px', source: 'google', weight: '400' },
    { name: 'Slabo 13px', family: 'Slabo 13px', source: 'google', weight: '400' },
    { name: 'Faustina', family: 'Faustina', source: 'google', weight: '400 500 600 700' },
    { name: 'Noticia Text', family: 'Noticia Text', source: 'google', weight: '400 700' },
    { name: 'Frank Ruhl Libre', family: 'Frank Ruhl Libre', source: 'google', weight: '300 400 500 700 900' },
    { name: 'Luthier', family: 'Luthier', source: 'google', weight: '400 700' },
    { name: 'Kameron', family: 'Kameron', source: 'google', weight: '400 700' },
    { name: 'Fenix', family: 'Fenix', source: 'google', weight: '400' },
    { name: 'Adamina', family: 'Adamina', source: 'google', weight: '400' },
    { name: 'Lusitana', family: 'Lusitana', source: 'google', weight: '400 700' },
    { name: 'Vidaloka', family: 'Vidaloka', source: 'google', weight: '400' }
  ],
  
  // Geometric Sans-Serif fonts
  'Geometric': [
    { name: 'Poppins', family: 'Poppins', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Montserrat', family: 'Montserrat', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Questrial', family: 'Questrial', source: 'google', weight: '400' },
    { name: 'Didact Gothic', family: 'Didact Gothic', source: 'google', weight: '400' },
    { name: 'Dosis', family: 'Dosis', source: 'google', weight: '300 400 500 600 700 800' },
    { name: 'Geo', family: 'Geo', source: 'google', weight: '400' },
    { name: 'Strait', family: 'Strait', source: 'google', weight: '400' },
    { name: 'Syncopate', family: 'Syncopate', source: 'google', weight: '400 700' },
    { name: 'Megrim', family: 'Megrim', source: 'google', weight: '400' },
    { name: 'Gruppo', family: 'Gruppo', source: 'google', weight: '400' },
    { name: 'Poiret One', family: 'Poiret One', source: 'google', weight: '400' },
    { name: 'Julius Sans One', family: 'Julius Sans One', source: 'google', weight: '400' },
    { name: 'Jura', family: 'Jura', source: 'google', weight: '300 400 500 600 700' },
    { name: 'Wire One', family: 'Wire One', source: 'google', weight: '400' },
    { name: 'Economica', family: 'Economica', source: 'google', weight: '400 700' }
  ],
  
  // Pixel/Retro Display fonts
  'Pixel & Retro Display': [
    { name: 'Press Start 2P', family: 'Press Start 2P', source: 'google', weight: '400' },
    // Additional pixel/retro
    { name: 'Pixelify Sans', family: 'Pixelify Sans', source: 'google', weight: '400 500 600 700' }
  ],
  
  // Tech & Startup fonts
  'Tech & Startup': [
    { name: 'Inter', family: 'Inter', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'IBM Plex Sans', family: 'IBM Plex Sans', source: 'google', weight: '300 400 500 600 700' },
    { name: 'IBM Plex Serif', family: 'IBM Plex Serif', source: 'google', weight: '300 400 500 600 700' },
    { name: 'IBM Plex Mono', family: 'IBM Plex Mono', source: 'google', weight: '300 400 500 600 700' },
    { name: 'Share Tech', family: 'Share Tech', source: 'google', weight: '400' },
    { name: 'Share Tech Mono', family: 'Share Tech Mono', source: 'google', weight: '400' },
    { name: 'Oxanium', family: 'Oxanium', source: 'google', weight: '300 400 500 600 700 800' },
    { name: 'Tomorrow', family: 'Tomorrow', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Major Mono Display', family: 'Major Mono Display', source: 'google', weight: '400' },
    { name: 'Nova Mono', family: 'Nova Mono', source: 'google', weight: '400' },
    { name: 'VT323', family: 'VT323', source: 'google', weight: '400' },
    { name: 'Xanh Mono', family: 'Xanh Mono', source: 'google', weight: '400' },
    { name: 'B612', family: 'B612', source: 'google', weight: '400 700' },
    { name: 'B612 Mono', family: 'B612 Mono', source: 'google', weight: '400 700' },
    { name: 'Anonymous Pro', family: 'Anonymous Pro', source: 'google', weight: '400 700' }
  ],
  
  // Luxury & Fashion fonts
  'Luxury': [
    { name: 'Tenor Sans', family: 'Tenor Sans', source: 'google', weight: '400' },
    { name: 'Forum', family: 'Forum', source: 'google', weight: '400' },
    { name: 'Cormorant Infant', family: 'Cormorant Infant', source: 'google', weight: '300 400 500 600 700' },
    { name: 'Cormorant Unicase', family: 'Cormorant Unicase', source: 'google', weight: '300 400 500 600 700' },
    { name: 'Cormorant SC', family: 'Cormorant SC', source: 'google', weight: '300 400 500 600 700' },
    { name: 'Gilda Display', family: 'Gilda Display', source: 'google', weight: '400' },
    { name: 'Italiana', family: 'Italiana', source: 'google', weight: '400' },
    { name: 'Federo', family: 'Federo', source: 'google', weight: '400' },
    { name: 'Marcellus', family: 'Marcellus', source: 'google', weight: '400' },
    { name: 'Marcellus SC', family: 'Marcellus SC', source: 'google', weight: '400' },
    { name: 'Petit Formal Script', family: 'Petit Formal Script', source: 'google', weight: '400' },
    { name: 'Mr De Haviland', family: 'Mr De Haviland', source: 'google', weight: '400' },
    { name: 'Pinyon Script', family: 'Pinyon Script', source: 'google', weight: '400' },
    { name: 'Euphoria Script', family: 'Euphoria Script', source: 'google', weight: '400' },
    { name: 'Lavishly Yours', family: 'Lavishly Yours', source: 'google', weight: '400' }
  ],
  
  // Retro & Vintage fonts
  'Retro': [
    { name: 'Press Start 2P', family: 'Press Start 2P', source: 'google', weight: '400' },
    { name: 'Monoton', family: 'Monoton', source: 'google', weight: '400' },
    { name: 'Bungee Shade', family: 'Bungee Shade', source: 'google', weight: '400' },
    { name: 'Bungee Hairline', family: 'Bungee Hairline', source: 'google', weight: '400' },
    { name: 'Bungee Outline', family: 'Bungee Outline', source: 'google', weight: '400' },
    { name: 'Faster One', family: 'Faster One', source: 'google', weight: '400' },
    { name: 'Fascinate', family: 'Fascinate', source: 'google', weight: '400' },
    { name: 'Fascinate Inline', family: 'Fascinate Inline', source: 'google', weight: '400' },
    { name: 'Monofett', family: 'Monofett', source: 'google', weight: '400' },
    { name: 'Wallpoet', family: 'Wallpoet', source: 'google', weight: '400' },
    { name: 'Vast Shadow', family: 'Vast Shadow', source: 'google', weight: '400' },
    { name: 'Ewert', family: 'Ewert', source: 'google', weight: '400' },
    { name: 'Plaster', family: 'Plaster', source: 'google', weight: '400' },
    { name: 'Sarina', family: 'Sarina', source: 'google', weight: '400' },
    { name: 'Kenia', family: 'Kenia', source: 'google', weight: '400' }
  ],
  
  // Branding & Corporate fonts
  'Branding': [
    { name: 'Prompt', family: 'Prompt', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Sawarabi Gothic', family: 'Sawarabi Gothic', source: 'google', weight: '400' },
    { name: 'M PLUS 1p', family: 'M PLUS 1p', source: 'google', weight: '300 400 500 700 800 900' },
    { name: 'M PLUS Rounded 1c', family: 'M PLUS Rounded 1c', source: 'google', weight: '300 400 500 700 800 900' },
    { name: 'Kosugi', family: 'Kosugi', source: 'google', weight: '400' },
    { name: 'Kosugi Maru', family: 'Kosugi Maru', source: 'google', weight: '400' },
    { name: 'Noto Sans JP', family: 'Noto Sans JP', source: 'google', weight: '300 400 500 700 900' },
    { name: 'BIZ UDPGothic', family: 'BIZ UDPGothic', source: 'google', weight: '400 700' },
    { name: 'Pathway Extreme', family: 'Pathway Extreme', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Radio Canada', family: 'Radio Canada', source: 'google', weight: '300 400 500 600 700' },
    { name: 'Syne Mono', family: 'Syne Mono', source: 'google', weight: '400' },
    { name: 'Syne Tactile', family: 'Syne Tactile', source: 'google', weight: '400' },
    { name: 'Trispace', family: 'Trispace', source: 'google', weight: '300 400 500 600 700 800' },
    { name: 'Truculenta', family: 'Truculenta', source: 'google', weight: '300 400 500 600 700 800 900' },
    { name: 'Unica One', family: 'Unica One', source: 'google', weight: '400' }
  ]
};

// Export the list of all font families
export const ALL_FONT_NAMES = Array.from(new Set(Object.values(FONT_CATEGORIES).flat().map(font => font.name)));

// Export common font names
export const COMMON_FONTS = [
  'Arial',
  'Helvetica', 
  'Times New Roman',
  'Georgia',
  'Courier New',
  'Inter',
  'Poppins',
  'Montserrat',
  'Playfair Display',
  'Source Sans Pro',
  'Lora',
  'Merriweather',
  'Roboto Slab',
  // High-usage designer picks
  'Geist',
  'HK Grotesk Wide',
  'Satoshi',
  'Cabinet Grotesk',
  'General Sans',
  'Bebas Neue',
  'Caveat',
  'Righteous',
  'Instrument Sans',
  'Bricolage Grotesque',
  'Young Serif',
  // New popular fonts from added categories
  'Bodoni Moda',
  'IBM Plex Sans',
  'Press Start 2P',
  'Tenor Sans',
  'Clash Display',
  'Unbounded',
  'Albert Sans',
  'Gabarito'
]; 