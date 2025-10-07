# ReactBits Component Library - Comprehensive Reference

## Overview

ReactBits (https://reactbits.dev) is an open-source collection of 135+ high-quality, animated, interactive, and fully customizable React components designed for building memorable websites and user interfaces.

**Author:** David Haz
**GitHub:** https://github.com/DavidHDev/react-bits
**License:** MIT + Commons Clause

## Key Features

- 135+ components across 7 categories
- 4 variants for each component: JS-CSS, JS-TW, TS-CSS, TS-TW
- Minimal dependencies
- Highly customizable through props
- Built with modern animation libraries (GSAP, Framer Motion, React Spring)
- Responsive and lightweight
- Full source code access for customization

## Installation Methods

### Method 1: Using jsrepo CLI (Recommended)

Initialize the repository:
```bash
npx jsrepo init https://reactbits.dev/tailwind
```

Install individual components:
```bash
npx jsrepo add https://reactbits.dev/tailwind/TextAnimations/BlurText
```

### Method 2: Using shadcn CLI

Components can also be installed using the shadcn CLI pattern (component-specific).

### Method 3: NPM Package

```bash
npm i @appletosolutions/reactbits
```

## Component Categories

### 1. Text Animations (22 components)
### 2. Animations (20 components)
### 3. Backgrounds (24 components)
### 4. Components (30 components)
### 5. Buttons (8 components)
### 6. Forms (20 components)
### 7. Loaders (9 components)

---

# Complete Component List

## 1. Text Animations (22 Components)

All text animation components use TypeScript and Tailwind.

### 1.1 ASCII Text
**Description:** Renders text with an animated ASCII background for a retro feel.

**Dependencies:** `three`

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| text | string | 'David!' | Text to display |
| asciiFontSize | number | 8 | Font size for ASCII characters |
| textFontSize | number | 200 | Font size for main text |
| textColor | string | '#fdf9f3' | Color of the main text |
| planeBaseHeight | number | 8 | Base height of the rendering plane |
| enableWaves | boolean | true | Enable wave animation effects |

**Features:**
- Uses Three.js for rendering
- Custom vertex and fragment shaders
- Interactive mouse-driven animations
- Responsive design with resize handlers

---

### 1.2 Blur Text
**Description:** Text starts blurred then crisply resolves for a soft-focus reveal effect.

**Dependencies:** `motion` (Framer Motion)

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| text | string | (required) | String to animate |
| delay | number | 0.05 | Animation delay between segments |
| animateBy | 'words' \| 'characters' | 'words' | Animation segmentation mode |
| direction | 'top' \| 'bottom' | 'top' | Animation direction |
| threshold | number | 0.1 | Intersection observer threshold |
| animationFrom | object | - | Custom initial animation state |
| animationTo | object | - | Custom animation keyframes |
| easing | string/array | - | Custom easing function |
| stepDuration | number | - | Duration of each animation step |

**Features:**
- Animates by words or characters
- View-based triggering with Intersection Observer
- Customizable blur, opacity, and translation effects
- Supports custom keyframes and easing

---

### 1.3 Circular Text
**Description:** Text arranged in a circular path.

**Dependencies:** TBD

**Use Cases:** Logos, badges, decorative headlines

---

### 1.4 Count Up
**Description:** Animated number counter with customizable formatting.

**Dependencies:** TBD

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| to | number | (required) | Target number to count to |
| from | number | 0 | Starting number |
| direction | 'up' \| 'down' | 'up' | Direction of counting |
| delay | number | 0 | Delay before starting |
| duration | number | 2 | Duration of animation |
| className | string | '' | CSS class for styling |
| startWhen | boolean | true | Condition to start count |
| separator | string | '' | Number separator (e.g., ',') |
| onStart | function | - | Callback when counting starts |
| onEnd | function | - | Callback when counting ends |

**Features:**
- Count up or down
- Number formatting with separators
- Event callbacks
- Conditional start

---

### 1.5 Curved Loop
**Description:** Text that follows a curved path in a loop.

**Use Cases:** Decorative text, rotational animations

---

### 1.6 Decrypted Text
**Description:** Text that appears to decrypt character by character.

**Use Cases:** Cyberpunk aesthetics, loading states

---

### 1.7 Falling Text
**Description:** Gravity-based falling effect for text characters.

**Use Cases:** Dramatic reveals, landing pages

---

### 1.8 Fuzzy Text
**Description:** Canvas-based text effect with distorted appearance.

**Use Cases:** Glitch aesthetics, attention-grabbing text

---

### 1.9 Glitch Text
**Description:** Cyberpunk-style glitch effects for text.

**Dependencies:** TBD

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| children | string | (required) | Text to display with glitch |
| speed | number | 0.5 | Animation speed of glitch |
| enableShadows | boolean | true | Toggle RGB split shadow effects |
| enableOnHover | boolean | false | Glitch only on hover |
| className | string | '' | Additional CSS classes |

**Features:**
- RGB split shadow effects
- Hover activation mode
- Configurable speed

---

### 1.10 Gradient Text
**Description:** Text with animated gradient effects.

**Use Cases:** Headlines, CTAs, branding

---

### 1.11 Rotating Text
**Description:** Text that rotates through different messages.

**Use Cases:** Feature highlights, rotating taglines

---

### 1.12 Scrambled Text
**Description:** Text that scrambles and resolves.

**Use Cases:** Loading states, reveals

---

### 1.13 Scroll Float
**Description:** Text that floats based on scroll position.

**Use Cases:** Parallax effects, landing pages

---

### 1.14 Scroll Reveal
**Description:** Text reveals on scroll.

**Use Cases:** Content reveals, storytelling

---

### 1.15 Scroll Velocity
**Description:** Text animation based on scroll velocity.

**Use Cases:** Dynamic scroll effects

---

### 1.16 Shiny Text
**Description:** Text with shimmering metallic effect.

**Use Cases:** Premium branding, highlights

---

### 1.17 Split Text
**Description:** Text that splits and animates.

**Use Cases:** Dramatic reveals, transitions

---

### 1.18 Text Cursor
**Description:** Typewriter-style cursor effect.

**Use Cases:** Terminal aesthetics, typing animations

---

### 1.19 Text Pressure
**Description:** Text responds to pressure/interaction.

**Use Cases:** Interactive experiences

---

### 1.20 Text Trail
**Description:** Text leaves a trail effect.

**Use Cases:** Motion graphics, dynamic headings

---

### 1.21 Text Type
**Description:** Realistic typing animation.

**Use Cases:** Chatbots, terminal interfaces

---

### 1.22 True Focus
**Description:** Focus effect that highlights text.

**Use Cases:** Drawing attention, UI highlighting

---

## 2. Animations (20 Components)

All animation components use TypeScript and Tailwind.

### 2.1 Animated Content
**Description:** General-purpose content animation wrapper.

**Use Cases:** Fade-ins, slides, transitions

---

### 2.2 Blob Cursor
**Description:** Custom cursor with blob effect and trail.

**Dependencies:** GSAP

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| blobType | 'circle' \| 'square' | 'circle' | Shape of blob |
| fillColor | string | '#5227FF' | Main blob color |
| trailCount | number | 3 | Number of trail blobs |
| sizes | number[] | [60, 125, 75] | Sizes of blob elements |
| innerSizes | number[] | [20, 35, 25] | Inner blob sizes |
| innerColor | string | 'rgba(255,255,255,0.8)' | Inner blob color |
| opacities | number[] | [0.6, 0.6, 0.6] | Opacity values |
| shadowColor | string | 'rgba(0,0,0,0.75)' | Shadow color |
| shadowBlur | number | 5 | Shadow blur radius |
| shadowOffsetX | number | 10 | Shadow X offset |
| shadowOffsetY | number | 10 | Shadow Y offset |
| filterId | string | 'blob' | SVG filter ID |
| filterStdDeviation | number | 30 | Filter blur deviation |
| filterColorMatrixValues | string | '1 0 0 0 0...' | Color matrix values |
| useFilter | boolean | true | Enable SVG filter |
| fastDuration | number | 0.1 | Fast animation duration |
| slowDuration | number | 0.5 | Slow animation duration |
| fastEase | string | 'power3.out' | Fast easing function |
| slowEase | string | 'power1.out' | Slow easing function |
| zIndex | number | 100 | Z-index positioning |

**Features:**
- Multiple blob trail effect
- GSAP-powered animations
- SVG filter effects
- Highly customizable appearance

---

### 2.3 Click Spark
**Description:** Spark particle effect on click.

**Dependencies:** TBD

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| sparkColor | string | '#fff' | Color of spark particles |
| sparkSize | number | 10 | Size of individual sparks |
| sparkRadius | number | 15 | Radius of spark spread |
| sparkCount | number | 8 | Number of sparks |
| duration | number | 400 | Animation duration (ms) |
| easing | 'linear' \| 'ease-in' \| 'ease-out' \| 'ease-in-out' | 'ease-out' | Easing function |
| extraScale | number | 1.0 | Additional scaling factor |
| children | ReactNode | - | Child components |

**Features:**
- Click-triggered particle effects
- Customizable spark appearance
- Multiple easing options

---

### 2.4 Crosshair
**Description:** Crosshair UI highlighting component.

**Use Cases:** Drawing user attention, UI focus indicators

---

### 2.5 Cubes
**Description:** 3D cube animation effects.

**Use Cases:** 3D transitions, loading states

---

### 2.6 Fade Content
**Description:** Fade animation for content.

**Use Cases:** Page transitions, content reveals

---

### 2.7 Glare Hover
**Description:** Glare effect on hover.

**Use Cases:** Card effects, interactive elements

---

### 2.8 Image Trail
**Description:** Images follow cursor in a trail.

**Use Cases:** Interactive galleries, creative portfolios

---

### 2.9 Magnet
**Description:** Magnetic hover effect.

**Use Cases:** Buttons, interactive elements

---

### 2.10 Magnet Lines
**Description:** Lines that follow cursor magnetically.

**Use Cases:** Creative backgrounds, interaction feedback

---

### 2.11 Meta Balls
**Description:** Organic blob morphing effects.

**Use Cases:** Abstract backgrounds, loading animations

---

### 2.12 Metallic Paint
**Description:** Metallic paint stroke effect.

**Use Cases:** Artistic transitions, highlights

---

### 2.13 Noise
**Description:** Noise texture animation.

**Use Cases:** Grain effects, textures

---

### 2.14 Pixel Trail
**Description:** Pixelated cursor trail.

**Use Cases:** Retro aesthetics, gaming interfaces

---

### 2.15 Pixel Transition
**Description:** Pixel-based transitions.

**Use Cases:** Scene changes, page transitions

---

### 2.16 Ribbons
**Description:** Ribbon animation effects.

**Use Cases:** Decorative elements, transitions

---

### 2.17 Shape Blur
**Description:** Blurred shape animations.

**Use Cases:** Abstract backgrounds, loading states

---

### 2.18 Splash Cursor
**Description:** Splash effect on cursor movement.

**Use Cases:** Interactive experiences, creative portfolios

---

### 2.19 Star Border
**Description:** Animated star border effect.

**Use Cases:** Card borders, highlighting

---

### 2.20 Sticker Peel
**Description:** Sticker peeling animation.

**Use Cases:** Interactive cards, reveals

---

## 3. Backgrounds (24 Components)

All background components use TypeScript and Tailwind.

### 3.1 Aurora
**Description:** Northern lights inspired gradient animation.

**Dependencies:** WebGL/Canvas

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| colorStops | string[] | ['#5227FF', '#7cff67', '#5227FF'] | Gradient color stops |
| amplitude | number | 1.0 | Vertical wave amplitude |
| blend | number | 0.5 | Blending/softness factor |
| time | number | auto | Custom time value |
| speed | number | 1.0 | Animation speed multiplier |

**Features:**
- WebGL-based rendering
- Custom color gradients
- Wave animation control
- Performance optimized

---

### 3.2 Balatro
**Description:** Card game inspired background effect.

**Use Cases:** Gaming interfaces, card-based layouts

---

### 3.3 Ballpit
**Description:** Interactive 3D ball pit using Three.js.

**Dependencies:** `three`

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| className | string | '' | CSS class for canvas |
| followCursor | boolean | true | First sphere follows cursor |
| ...props | object | {} | Additional physics config |

**Features:**
- Three.js-based 3D rendering
- Physics simulation
- Customizable materials
- Interactive cursor following

**Use Cases:** Gamification, interactive backgrounds

---

### 3.4 Beams
**Description:** Light beam animation effects.

**Use Cases:** Futuristic backgrounds, spotlight effects

---

### 3.5 Dark Veil
**Description:** Dark overlay with effects.

**Use Cases:** Modal backgrounds, overlays

---

### 3.6 Dither
**Description:** Dithered texture effect.

**Use Cases:** Retro aesthetics, noise patterns

---

### 3.7 Dot Grid
**Description:** Animated dot grid pattern.

**Use Cases:** Technical backgrounds, grid layouts

---

### 3.8 Faulty Terminal
**Description:** Glitchy terminal-style background.

**Use Cases:** Cyberpunk themes, error states

---

### 3.9 Galaxy
**Description:** Starfield and galaxy animation.

**Use Cases:** Space themes, cosmic backgrounds

---

### 3.10 Grid Distortion
**Description:** Distorted grid animation.

**Use Cases:** Abstract backgrounds, transitions

---

### 3.11 Grid Motion
**Description:** Animated grid with motion effects.

**Use Cases:** Technical backgrounds, data visualization

---

### 3.12 Hyperspeed
**Description:** Warp-speed animation effect.

**Dependencies:** Three.js

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| effectOptions | Partial&lt;HyperspeedOptions&gt; | {} | Customization options |

**HyperspeedOptions:**
- onSpeedUp: Callback on speed increase
- onSlowDown: Callback on speed decrease
- distortion: Distortion effect configuration
- length: Road/scene length
- roadWidth: Width of the road
- fov: Field of view
- fovSpeedUp: FOV when speeding up
- speedUp: Speed multiplier
- colors: Color configuration

**Features:**
- Three.js-based 3D rendering
- Customizable speed and distortion
- Event callbacks
- Color customization

**Use Cases:** Sci-fi effects, loading screens

---

### 3.13 Iridescence
**Description:** Iridescent color shifting effect.

**Use Cases:** Premium branding, artistic backgrounds

---

### 3.14 Letter Glitch
**Description:** Background with glitching letters.

**Use Cases:** Matrix-style effects, tech themes

---

### 3.15 Light Rays
**Description:** Volumetric light ray effects.

**Use Cases:** Atmospheric backgrounds, highlights

---

### 3.16 Lightning
**Description:** Lightning bolt animations.

**Use Cases:** Storm effects, energy themes

---

### 3.17 Liquid Chrome
**Description:** Liquid metal/chrome effect.

**Use Cases:** Premium designs, futuristic themes

---

### 3.18 Orb
**Description:** Floating orb with glow effects.

**Use Cases:** Abstract backgrounds, focus points

---

### 3.19 Particles
**Description:** Particle system background.

**Dependencies:** Three.js

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| particleCount | number | 200 | Total number of particles |
| particleSpread | number | 10 | Spatial distribution |
| speed | number | 0.1 | Movement speed |
| particleColors | string[] | ['#ffffff', '#ffffff', '#ffffff'] | Color palette |
| moveParticlesOnHover | boolean | false | Enable hover movement |
| particleHoverFactor | number | 1 | Hover movement intensity |
| alphaParticles | boolean | false | Enable transparency |
| particleBaseSize | number | 100 | Base particle size |
| sizeRandomness | number | 1 | Size variation factor |
| cameraDistance | number | 20 | Camera distance |
| disableRotation | boolean | false | Disable rotation |
| className | string | undefined | Custom CSS class |

**Features:**
- Three.js particle system
- Interactive hover effects
- Customizable colors and sizes
- Performance optimized

---

### 3.20 Ripple Grid
**Description:** Grid with ripple wave effects.

**Use Cases:** Interactive backgrounds, water themes

---

### 3.21 Silk
**Description:** Flowing silk fabric animation.

**Use Cases:** Elegant backgrounds, luxury themes

---

### 3.22 Squares
**Description:** Animated square pattern.

**Use Cases:** Geometric backgrounds, grid patterns

---

### 3.23 Threads
**Description:** Thread/string animation effects.

**Use Cases:** Network visualizations, connections

---

### 3.24 Waves
**Description:** Wave animation background.

**Use Cases:** Water themes, flowing effects

---

## 4. Components (30 Components)

All use TypeScript and Tailwind.

### 4.1 Animated List
**Description:** List with item animations.

**Use Cases:** Content lists, menus

---

### 4.2 Bounce Cards
**Description:** Cards with bounce animation.

**Use Cases:** Product showcases, galleries

---

### 4.3 Card Swap
**Description:** Card flip/swap animation.

**Use Cases:** Before/after, interactive cards

---

### 4.4 Carousel
**Description:** Image/content carousel.

**Dependencies:** TBD

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| items | CarouselItem[] | DEFAULT_ITEMS | Array of carousel items |
| baseWidth | number | 300 | Container width |
| autoplay | boolean | false | Enable auto-sliding |
| autoplayDelay | number | 3000 | Time between slides (ms) |
| pauseOnHover | boolean | false | Pause on hover |
| loop | boolean | false | Enable continuous loop |
| round | boolean | false | Circular design |

**Features:**
- Autoplay support
- Pause on hover
- Looping
- Customizable items

**Use Cases:** Image galleries, content showcases

---

### 4.5 Chroma Grid
**Description:** Chromatic grid layout.

**Use Cases:** Color showcases, galleries

---

### 4.6 Circular Gallery
**Description:** Gallery arranged in circle.

**Use Cases:** Image showcases, portfolios

---

### 4.7 Counter
**Description:** Animated counter component.

**Use Cases:** Statistics, metrics display

---

### 4.8 Decay Card
**Description:** Card with decay/disintegration effect.

**Use Cases:** Transitions, removal effects

---

### 4.9 Dock
**Description:** macOS-style dock component.

**Use Cases:** Navigation, app launchers

---

### 4.10 Elastic Slider
**Description:** Slider with elastic physics.

**Use Cases:** Range inputs, controls

---

### 4.11 Flowing Menu
**Description:** Menu with flow animations.

**Use Cases:** Navigation, dropdowns

---

### 4.12 Fluid Glass
**Description:** Glassmorphism component.

**Use Cases:** Cards, modals, panels

---

### 4.13 Flying Posters
**Description:** Posters with 3D flying effect.

**Use Cases:** Galleries, showcases

---

### 4.14 Folder
**Description:** Animated folder component.

**Use Cases:** File browsers, organization

---

### 4.15 Glass Icons
**Description:** Icons with glass effect.

**Use Cases:** Icon showcases, navigation

---

### 4.16 Glass Surface
**Description:** Glass surface component.

**Use Cases:** Panels, cards, overlays

---

### 4.17 Gooey Nav
**Description:** Navigation with gooey blob effect.

**Use Cases:** Creative navigation

---

### 4.18 Infinite Menu
**Description:** Infinitely scrolling menu.

**Use Cases:** Long lists, infinite scroll

---

### 4.19 Infinite Scroll
**Description:** Infinite scroll implementation.

**Use Cases:** Content feeds, galleries

---

### 4.20 Lanyard
**Description:** ID lanyard style component.

**Use Cases:** Profiles, badges

---

### 4.21 Magic Bento
**Description:** Interactive bento grid layout.

**Dependencies:** TBD

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| textAutoHide | boolean | true | Enable text truncation |
| enableStars | boolean | true | Enable particle animations |
| enableSpotlight | boolean | true | Global spotlight effect |
| enableBorderGlow | boolean | true | Border glow effect |
| disableAnimations | boolean | false | Disable all animations |
| spotlightRadius | number | 300 | Spotlight radius |
| particleCount | number | 12 | Number of particles |
| enableTilt | boolean | false | 3D tilt on hover |
| glowColor | string | "132, 0, 255" | Glow/particle color (RGB) |
| clickEffect | boolean | true | Ripple on click |
| enableMagnetism | boolean | true | Magnetic hover interaction |

**Features:**
- Multiple visual effects
- Particle system
- Spotlight effect
- 3D tilt interaction
- Click ripple
- Magnetic hover
- Border glow

**Use Cases:** Feature grids, product showcases

---

### 4.22 Masonry
**Description:** Masonry grid layout.

**Use Cases:** Image galleries, Pinterest-style

---

### 4.23 Model Viewer
**Description:** 3D model viewer component.

**Use Cases:** Product showcases, 3D content

---

### 4.24 Pixel Card
**Description:** Card with pixelated effects.

**Use Cases:** Retro designs, gaming

---

### 4.25 Rolling Gallery
**Description:** Gallery with rolling animation.

**Use Cases:** Image showcases, portfolios

---

### 4.26 Scroll Stack
**Description:** Stacking cards on scroll.

**Use Cases:** Content reveals, storytelling

---

### 4.27 Spotlight Card
**Description:** Card with spotlight effect.

**Use Cases:** Feature highlights, CTAs

---

### 4.28 Stack
**Description:** Stacked cards component.

**Use Cases:** Layered content, walkthroughs

---

### 4.29 Stepper
**Description:** Step indicator component.

**Use Cases:** Multi-step forms, wizards

---

### 4.30 Tilted Card
**Description:** Card with 3D tilt effect.

**Use Cases:** Interactive cards, showcases

---

## 5. Buttons (8 Components)

Traditional button designs using CSS (no Tailwind or TypeScript).

1. Button 1
2. Button 2
3. Button 3
4. Button 4
5. Button 5
6. Button 6
7. Button 7
8. Button 8

**Note:** These are traditional button components with CSS styling. Specific props not documented in current sources.

---

## 6. Forms (20 Components)

Traditional form designs using CSS (no Tailwind or TypeScript).

1. Form 1
2. Form 2
3. Form 3
4. Form 4
5. Form 5
6. Form 6
7. Form 7
8. Form 8
9. Form 9
10. Form 10
11. Form 11
12. Form 12
13. Form 13
14. Form 14
15. Form 15
16. Form 16
17. Form 17
18. Form 18
19. Form 19
20. Form 20

**Note:** These are traditional form components with CSS styling. Specific props not documented in current sources.

---

## 7. Loaders (9 Components)

Traditional loading animations using CSS (no Tailwind or TypeScript).

1. Loader 1
2. Loader 2
3. Loader 3
4. Loader 4
5. Loader 5
6. Loader 6
7. Loader 7
8. Loader 8
9. Loader 9

**Note:** These are traditional loader components with CSS styling. Specific props not documented in current sources.

---

# Component JSON Structure

Each component is stored in the repository as a JSON file following this pattern:

**File naming:** `ComponentName-Language-Styling.json`
- Examples: `BlurText-TS-TW.json`, `Aurora-JS-CSS.json`

**JSON Structure:**
```json
{
  "name": "ComponentName-TS-TW",
  "type": "registry:block",
  "title": "ComponentName",
  "description": "Component description",
  "dependencies": ["dependency1", "dependency2"],
  "files": [
    {
      "path": "components/ComponentName.tsx",
      "content": "// Component source code",
      "type": "registry:component"
    }
  ]
}
```

**Repository Location:**
- GitHub: `/public/r/` directory
- Contains 459 JSON files
- Each represents a component variant

---

# Integration Guidelines for NextSlide

## Recommended Integration Approach

### 1. Component Discovery
- Parse component registry from GitHub
- Categorize by type (text-animations, backgrounds, etc.)
- Build searchable component library

### 2. Dynamic Component Loading
```typescript
// Example structure
interface ReactBitsComponent {
  id: string;
  name: string;
  category: 'text-animations' | 'animations' | 'backgrounds' | 'components' | 'buttons' | 'forms' | 'loaders';
  variant: 'JS-CSS' | 'JS-TW' | 'TS-CSS' | 'TS-TW';
  description: string;
  dependencies: string[];
  props: ComponentProps;
}
```

### 3. Props Configuration UI
Create a dynamic form builder based on component props:
- Number inputs for numeric props
- Color pickers for color props
- Toggles for boolean props
- Text inputs for string props
- Dropdowns for enum props

### 4. Component Installation
Two approaches:
1. **Bundle Popular Components:** Pre-install commonly used components
2. **On-Demand Loading:** Fetch component code from GitHub when user adds it

### 5. Slide Integration
```typescript
interface SlideComponent {
  type: 'reactbits';
  componentName: string;
  variant: string;
  props: Record<string, any>;
  position: { x: number; y: number };
  size: { width: number; height: number };
}
```

## High-Priority Components for Slide Presentations

### Text Animations (Essential)
1. **Blur Text** - Smooth reveals
2. **Count Up** - Statistics, metrics
3. **Glitch Text** - Attention grabbing
4. **Gradient Text** - Branding
5. **Split Text** - Dramatic reveals
6. **Text Type** - Sequential reveals

### Backgrounds (Visual Impact)
1. **Aurora** - Elegant backgrounds
2. **Particles** - Dynamic backgrounds
3. **Hyperspeed** - Transitions
4. **Waves** - Smooth backgrounds
5. **Grid Motion** - Technical themes

### Animations (Interactivity)
1. **Click Spark** - Interactive feedback
2. **Blob Cursor** - Creative cursor
3. **Fade Content** - Transitions
4. **Star Border** - Highlighting

### Components (Functionality)
1. **Carousel** - Image showcases
2. **Magic Bento** - Feature grids
3. **Counter** - Statistics
4. **Stepper** - Multi-step content
5. **Spotlight Card** - Feature highlights

## Component Quality Notes

Based on the MCP server assessment:

**Excellent Quality (9.0-10/10):**
- Aurora, Beams, Particles (Backgrounds)
- BlobCursor, SplashCursor, Magnet (Animations)
- BlurText, CountUp, CircularText (Text Animations)

**Incomplete/Placeholder:**
- All 8 Button components
- All 3 Form components
- All 9 Loader components

**Recommendation:** Focus on the modern TypeScript + Tailwind components, avoid the traditional CSS-only components (Buttons, Forms, Loaders) as they appear to be placeholders.

---

# Common Dependencies

Most components require one or more of these libraries:

- **Framer Motion** (`motion`) - Animation library
- **Three.js** (`three`) - 3D graphics
- **GSAP** - Animation platform
- **React Spring** - Spring physics animations

Ensure these are installed in your project:
```bash
npm install framer-motion three gsap react-spring
```

---

# Additional Resources

- **Website:** https://reactbits.dev
- **GitHub:** https://github.com/DavidHDev/react-bits
- **NPM:** @appletosolutions/reactbits
- **MCP Server:** https://github.com/ceorkm/reactbits-mcp-server (135+ components catalogued)

---

# Notes for Implementation

1. **Component Variants:** Each component has 4 variants - choose TypeScript + Tailwind (TS-TW) for best integration
2. **Props System:** All modern components support extensive customization through props
3. **Dependencies:** Check component JSON for required dependencies
4. **Installation:** Use jsrepo CLI or fetch from GitHub repository
5. **Responsive:** All components are designed to be responsive
6. **Performance:** Components use optimized animation libraries
7. **Licensing:** MIT + Commons Clause - verify compliance for your use case

---

*Last Updated: 2025-10-02*
*Source: reactbits.dev, GitHub repository, MCP server documentation*
