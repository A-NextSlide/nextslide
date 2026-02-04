"""
Curated PixelBuddha Font List
Top 79 fonts selected for quality, versatility, and performance.
These fonts are used for hero/title text only (never body text).
"""

# Curated list of 79 best PixelBuddha fonts for hero/title text
# Selected based on: design quality, versatility, metadata scoring, and usability
# These are the ACTUAL font IDs from the registry
CURATED_PIXELBUDDHA_FONTS = [
    # Top scored modern & clean fonts
    "1145-nord-free-font",
    "4896-sophistik-sans-modern-sans-typeface",
    "4952-monoglyphic-clean-monospace-font",
    "4185-403-malno-mono-sans-serif-font",
    "4241-fbs-chopen-sans",
    "3685-gendra-modern-sans-serif",
    "3987-monigue-condensed-sans-serif-font",
    "4418-vestige-grotesk-display",
    "2421-milano-sans-serif-font",
    "1626-nexusbold-modern-condensed-sans",
    "1748-mildstones-modern-bold-sans",
    "2327-carlo-monaco-sans-serif",
    "3967-chunko-bold-sans-serif",
    "4220-bulchuy-sans-serif-font",
    "4319-403-glach-sans",
    "1699-sk-ilke-mono-geometric-sans",
    "1719-sk-barbicane-solo-font",
    "4053-malinton-display-sans-font-family",
    "2740-monograf-sans-serif-family",
    "2405-carrol-wild-sans-serif-typeface",
    
    # Serif & Editorial fonts
    "4649-mattire-modern-serif-typeface",
    "1745-richford-signature-font",
    "1592-eitencia-display-serif",
    "1609-elova-elegant-serif-font",
    "1617-one-of-a-kind-serif-font",
    "1529-rocline-modern-serif",
    "1744-norden-modern-serif-font",
    "1467-the-billion-butterfly-serif",
    "1453-kaobe-luxury-serif-font",
    "1561-tbj-buffy-light-italic-serif",
    "2353-karelle-serif-font",
    "3026-mountriel-classic-serif-font",
    "2603-magical-paradise-modern-serif-typeface",
    "3911-somare-hand-lettered-slab-serif",
    "42-sodabery-serif-font-free-download",
    "4265-403-fulgers-serif",
    "4863-la-formika-stylish-typeface",
    "4798-mavora-sans-typeface-45-weights",
    
    # Display & Decorative fonts
    "4919-fantom-fusion-minimal-typeface",
    "4165-golte-font",
    "5012-solid-surge-nostalgic-1980s-typeface",
    "4876-gratitude-glow-typeface",
    "4953-rosity-beautiful-modern-typeface",
    "4954-sappy-sans",
    "2371-brume-decorative-font",
    "2348-cognace-decorative-font",
    "4916-night-lounge-tall-sans-typeface",
    "4917-digital-deco-typeface",
    "4930-oceania-mesmerizing-typeface",
    "4998-zig-zag-zest-quirky-typeface",
    "4999-benito-timeless-typeface",
    "3708-lacotte-modern-display-font",
    "3355-luxury-charm-modern-ligature-font",
    "4646-bright-retro-font",
    "4650-bon-foyage-vintage-serif-font",
    "4677-transcity-a-playful-serif",
    
    # Script & Artistic fonts
    "1493-ncl-kisgade-casual-script-font",
    "1525-retro-cooper-vintage-bold-script",
    "2365-degalasi-script-font",
    "2467-made-bruno-typeface",
    "2475-font-duo-ever-enigmatic",
    "1689-serenity-squared-retro-font",
    "4725-hyacinth-modern-blackletter-font",
    "4726-bodywork-modern-blackletter",
    "4749-kindly-season-3-font",
    "4753-valor-forge-bold-masculine-typeface",
    "4776-fernaria-elegant-art-nouveau-typeface",
    "4791-bionca-stylistic-sans-serif",
    "4792-shinier-sans-serif-font",
    "4822-malishka-playful-kids-typeface",
    "4073-barnule-mauren-western-font-duo",
    "4126-403-doshi",
    "4240-403-proxel-pixel-typeface",
    "4380-403-absently-display-font",
    "4602-fbs-machro-font",
    "4975-hf-lorflo-display-font",
    "4983-likethat-font",
]

# Additional fallback fonts (high quality alternatives)
FALLBACK_PIXELBUDDHA_FONTS = []

def get_curated_font_ids() -> list[str]:
    """Get the curated list of PixelBuddha font IDs"""
    return CURATED_PIXELBUDDHA_FONTS + FALLBACK_PIXELBUDDHA_FONTS

def is_curated_pixelbuddha_font(font_id: str) -> bool:
    """Check if a font ID is in the curated PixelBuddha list"""
    return font_id in CURATED_PIXELBUDDHA_FONTS or font_id in FALLBACK_PIXELBUDDHA_FONTS

# Stats for reference
TOTAL_CURATED = len(CURATED_PIXELBUDDHA_FONTS)
TOTAL_WITH_FALLBACK = len(CURATED_PIXELBUDDHA_FONTS) + len(FALLBACK_PIXELBUDDHA_FONTS)
