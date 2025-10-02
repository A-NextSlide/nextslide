"""
Font Serving API - Provides endpoints for serving fonts to the frontend
Serves both PixelBuddha and Designer/Unblast fonts
"""

import os
import json
from pathlib import Path
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Query, Response
from urllib.parse import unquote
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
import logging

# Add parent directory to path for imports
import sys
sys.path.append(str(Path(__file__).parent.parent))

from services.enhanced_font_service import EnhancedFontService

logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/api/fonts", tags=["fonts"])

# Initialize enhanced font service with metadata support
font_service = EnhancedFontService()

# Cache for font list (to avoid regenerating on every request)
_font_list_cache = None
_font_list_cache_time = 0
CACHE_DURATION = 300  # 5 minutes


class FontInfo(BaseModel):
    """Font information model"""
    id: str
    name: str
    category: str
    source: str
    styles: Optional[Dict] = None
    files: Optional[List] = None
    tags: Optional[List[str]] = None
    description: Optional[str] = None


class FontListResponse(BaseModel):
    """Response model for font list"""
    fonts: List[FontInfo]
    total: int
    categories: Dict[str, int]


class FontRecommendation(BaseModel):
    """Font recommendation request model"""
    deck_title: str
    vibe: str
    content_keywords: Optional[List[str]] = None
    target_audience: Optional[str] = None


@router.get("/list", response_model=FontListResponse)
async def get_font_list(
    category: Optional[str] = Query(None, description="Filter by category"),
    source: Optional[str] = Query(None, description="Filter by source (pixelbuddha/designer)"),
    search: Optional[str] = Query(None, description="Search fonts by name"),
    limit: Optional[int] = Query(None, description="Limit number of results"),
    offset: Optional[int] = Query(0, description="Offset for pagination"),
    available_only: Optional[bool] = Query(False, description="Only include fonts with resolvable files")
):
    """
    Get list of all available fonts with optional filtering
    """
    try:
        fonts = []
        
        # Get all fonts from service
        for font_id, font_data in font_service.all_fonts.items():
            # Apply filters
            if category and font_data.get('category', '').lower() != category.lower():
                continue
            if source and font_data.get('source', '').lower() != source.lower():
                continue
            if search and search.lower() not in font_data.get('name', '').lower():
                continue
            if available_only:
                try:
                    # Quick availability check
                    if not font_service.get_font_path(font_id, 'regular'):
                        continue
                except Exception:
                    continue
            
            # Create font info
            font_info = FontInfo(
                id=font_id,
                name=font_data.get('name', font_id),
                category=font_data.get('category', 'unknown'),
                source=font_data.get('source', 'unknown'),
                tags=font_data.get('tags', []),
                description=font_data.get('description', '')
            )
            
            # Add style/file info based on source
            if font_data.get('source') == 'pixelbuddha':
                font_info.files = font_data.get('files', [])
            else:
                font_info.styles = font_data.get('styles', {})
            
            fonts.append(font_info)
        
        # Sort by name
        fonts.sort(key=lambda x: x.name)
        
        # Apply pagination
        total = len(fonts)
        if limit:
            fonts = fonts[offset:offset + limit]
        
        # Get category counts
        categories = {}
        for font_data in font_service.all_fonts.values():
            cat = font_data.get('category', 'unknown')
            categories[cat] = categories.get(cat, 0) + 1
        
        return FontListResponse(
            fonts=fonts,
            total=total,
            categories=categories
        )
        
    except Exception as e:
        logger.error(f"Error getting font list: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/font/{font_id}")
async def get_font_info(font_id: str):
    """
    Get detailed information about a specific font
    """
    font_data = font_service.get_font_by_id(font_id)
    
    if not font_data:
        raise HTTPException(status_code=404, detail=f"Font '{font_id}' not found")
    
    return font_data


@router.get("/file/{font_id}")
async def serve_font_file(
    font_id: str,
    style: Optional[str] = Query('regular', description="Font style (regular, bold, italic, etc)")
):
    """
    Serve the actual font file for a given font ID
    """
    # Get font path from service
    font_path = font_service.get_font_path(font_id, style)
    try:
        logger.info(f"[/file] id={font_id} style={style} rel={font_path}")
    except Exception:
        pass
    
    if not font_path:
        raise HTTPException(status_code=404, detail=f"Font file not found for '{font_id}'")
    
    # Resolve full path
    full_path = Path(__file__).parent.parent / font_path
    
    if not full_path.exists():
        try:
            logger.error(f"[/file] 404: {full_path}")
        except Exception:
            pass
        raise HTTPException(status_code=404, detail=f"Font file not found at path")
    
    # Determine MIME type based on extension
    ext = full_path.suffix.lower()
    mime_types = {
        '.ttf': 'font/ttf',
        '.otf': 'font/otf',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2'
    }
    
    media_type = mime_types.get(ext, 'application/octet-stream')
    
    # Set cache headers for fonts (they don't change often)
    headers = {
        'Cache-Control': 'public, max-age=31536000',  # Cache for 1 year
        'Access-Control-Allow-Origin': '*'  # Allow cross-origin requests
    }
    
    return FileResponse(
        path=full_path,
        media_type=media_type,
        headers=headers,
        filename=full_path.name
    )


@router.post("/recommend")
async def get_font_recommendations(request: FontRecommendation):
    """
    Get font recommendations based on presentation context
    """
    try:
        recommendations = font_service.get_fonts_for_theme(
            deck_title=request.deck_title,
            vibe=request.vibe,
            content_keywords=request.content_keywords,
            target_audience=request.target_audience
        )
        
        return recommendations
        
    except Exception as e:
        logger.error(f"Error getting font recommendations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/search")
async def search_fonts(
    query: str = Query(..., description="Search query"),
    limit: int = Query(20, description="Maximum results to return")
):
    """
    Search fonts by name, category, or tags
    """
    try:
        results = font_service.search_fonts(query, limit)
        return {"results": results, "total": len(results)}
        
    except Exception as e:
        logger.error(f"Error searching fonts: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/statistics")
async def get_font_statistics():
    """
    Get statistics about the font collection
    """
    try:
        stats = font_service.get_statistics()
        return stats
        
    except Exception as e:
        logger.error(f"Error getting font statistics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/catalog")
async def get_font_catalog():
    """
    Get a simplified font catalog for frontend consumption
    Returns font names grouped by category with basic metadata
    """
    try:
        catalog = {
            "categories": {},
            "total": 0,
            "sources": {
                "pixelbuddha": 0,
                "designer": 0
            }
        }
        
        # Group fonts by category
        for font_id, font_data in font_service.all_fonts.items():
            category = font_data.get('category', 'unknown')
            source = font_data.get('source', 'unknown')
            
            if category not in catalog['categories']:
                catalog['categories'][category] = []
            
            # Add simplified font info
            catalog['categories'][category].append({
                'id': font_id,
                'name': font_data.get('name', font_id),
                'source': source
            })
            
            # Update source counts
            if source in catalog['sources']:
                catalog['sources'][source] += 1
            
            catalog['total'] += 1
        
        # Sort fonts within each category
        for category in catalog['categories']:
            catalog['categories'][category].sort(key=lambda x: x['name'])
        
        return catalog
        
    except Exception as e:
        logger.error(f"Error getting font catalog: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pixelbuddha/{font_id}/{path:path}")
async def serve_pixelbuddha_font(font_id: str, path: str):
    """
    Direct path serving for PixelBuddha fonts
    Handles the nested directory structure
    """
    # Construct the full path
    # Real folder layout is pixelbuddha/downloads/extracted/{font_id}/...
    base_dir = Path(__file__).parent.parent / "assets" / "fonts" / "pixelbuddha"
    # Decode any percent-encoded characters (including %2F which often isn't decoded automatically)
    decoded = unquote(path)
    # Strip optional leading assets prefix and normalize legacy folder names
    if decoded.startswith("assets/fonts/pixelbuddha/"):
        decoded = decoded[len("assets/fonts/pixelbuddha/"):]
    decoded = decoded.replace("all_downloads/", "downloads/")
    # If the decoded path already contains downloads/extracted/<id>/..., use as-is; else treat it as remainder under the id
    if decoded.startswith("downloads/extracted/"):
        font_path = base_dir / decoded
    else:
        font_path = base_dir / "downloads" / "extracted" / font_id / decoded
    try:
        logger.info(f"[PB] id={font_id} decoded={decoded} path={font_path}")
    except Exception:
        pass
    
    if not font_path.exists():
        try:
            logger.error(f"[PB] 404 missing: {font_path}")
        except Exception:
            pass
        raise HTTPException(status_code=404, detail=f"Font file not found")
    
    # Determine MIME type
    ext = font_path.suffix.lower()
    mime_types = {
        '.ttf': 'font/ttf',
        '.otf': 'font/otf',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2'
    }
    
    media_type = mime_types.get(ext, 'application/octet-stream')
    
    # Set cache headers
    headers = {
        'Cache-Control': 'public, max-age=31536000',
        'Access-Control-Allow-Origin': '*'
    }
    
    return FileResponse(
        path=font_path,
        media_type=media_type,
        headers=headers,
        filename=font_path.name
    )


@router.get("/designer/{font_id}/{filename}")
async def serve_designer_font(font_id: str, filename: str):
    """
    Direct path serving for Designer/Unblast fonts
    Handles the flatter directory structure
    """
    # Construct the full path
    font_path = Path(__file__).parent.parent / "assets" / "fonts" / "designer" / font_id / filename
    
    if not font_path.exists():
        raise HTTPException(status_code=404, detail=f"Font file not found")
    
    # Determine MIME type
    ext = font_path.suffix.lower()
    mime_types = {
        '.ttf': 'font/ttf',
        '.otf': 'font/otf',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2'
    }
    
    media_type = mime_types.get(ext, 'application/octet-stream')
    
    # Set cache headers
    headers = {
        'Cache-Control': 'public, max-age=31536000',
        'Access-Control-Allow-Origin': '*'
    }
    
    return FileResponse(
        path=font_path,
        media_type=media_type,
        headers=headers,
        filename=font_path.name
    )


@router.get("/search-by-tags")
async def search_by_tags(
    tags: str = Query(..., description="Comma-separated list of tags to search for")
):
    """
    Search fonts by specific tags from metadata
    """
    try:
        tag_list = [tag.strip() for tag in tags.split(',')]
        results = font_service.search_fonts_by_tags(tag_list)
        return {"results": results, "total": len(results), "searched_tags": tag_list}
        
    except Exception as e:
        logger.error(f"Error searching fonts by tags: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/use-case/{use_case}")
async def get_fonts_by_use_case(use_case: str):
    """
    Get fonts recommended for specific use case (body_text, headline, print, etc)
    """
    try:
        fonts = font_service.get_fonts_for_use_case(use_case)
        return {
            "use_case": use_case,
            "fonts": fonts,
            "total": len(fonts)
        }
        
    except Exception as e:
        logger.error(f"Error getting fonts for use case: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/metadata/{font_id}")
async def get_font_metadata(font_id: str):
    """
    Get complete metadata for a specific font including description, tags, and best_for
    """
    font_data = font_service.get_font_by_id(font_id)
    
    if not font_data:
        raise HTTPException(status_code=404, detail=f"Font '{font_id}' not found")
    
    return font_data


# Health check endpoint
@router.get("/health")
async def health_check():
    """Check if font service is working with enhanced metadata"""
    stats = font_service.get_statistics()
    return {
        "status": "healthy",
        "total_fonts": stats['total'],
        "pixelbuddha_fonts": stats['pixelbuddha'],
        "designer_fonts": stats['designer'],
        "fonts_with_metadata": stats['with_metadata'],
        "indexed_tags": len(stats.get('tags', {})),
        "use_cases": list(stats.get('use_cases', {}).keys())
    }