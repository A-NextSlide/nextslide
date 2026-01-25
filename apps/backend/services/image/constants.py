"""Domain configuration constants for image services."""

# Domains that are known to block hotlinking, have CORS issues, or require auth
BLOCKED_DOMAINS = frozenset({
    # Social media - always block hotlinking
    'facebook.com', 'fbcdn.net', 'fb.com',
    'pinterest.com', 'pinimg.com',
    'instagram.com', 'cdninstagram.com', 'lookaside.instagram.com',
    'twitter.com', 'twimg.com', 'x.com',
    'tiktok.com',
    'linkedin.com',
    'reddit.com', 'redd.it',
    # Art sites with hotlink protection
    'deviantart.com',
    # Wikipedia rate limits aggressively (HTTP 429)
    'wikimedia.org', 'wikipedia.org',
})

# Domains known to be reliable for direct image access
PREFERRED_DOMAINS = frozenset({
    'imgur.com', 'i.imgur.com',
    'unsplash.com', 'images.unsplash.com',
    'pexels.com', 'images.pexels.com',
    'cloudinary.com', 'res.cloudinary.com',
    'googleusercontent.com',
    'ggpht.com',
    'gstatic.com',
    'staticflickr.com', 'flickr.com',
    'cdn.pixabay.com',
})

# Our storage bucket domains - images here don't need re-uploading
BUCKET_DOMAINS = ('nextslide.ai', 'supabase.co', 'supabase.com')

# Generic terms that produce poor image search results
# AI handles query quality, so we only need minimal filtering
GENERIC_IMAGE_TERMS = frozenset({
    'image', 'images', 'photo', 'photos', 'picture', 'pictures',
    'pic', 'pics', 'illustration', 'illustrations', 'graphic', 'graphics',
    'icon', 'icons', 'placeholder', 'placeholders',
    'background', 'backgrounds', 'bg', 'banner', 'banners',
    'hero', 'visual', 'visuals', 'concept', 'abstract',
    'decorative', 'default', 'sample', 'samples',
    'stock', 'generic', 'filler', 'random', 'img', 'imgs',
})

# Prop name tokens that indicate an image field
IMAGE_PROP_TOKENS = (
    'image', 'photo', 'pic', 'picture', 'img',
    'avatar', 'logo', 'bg', 'background', 'banner',
    'thumb', 'thumbnail', 'icon', 'poster', 'cover',
)

# Generic variable names that should not be treated as meaningful prop names
GENERIC_VAR_NAMES = frozenset({
    'obj', 'item', 'data', 'entry', 'row',
    'card', 'element', 'node',
})
