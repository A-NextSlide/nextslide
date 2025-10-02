import React from "react";
import { ComponentInstance } from "../../types/components";

/**
 * Extracts YouTube video ID from various URL formats.
 * @param url The URL to parse.
 * @returns The YouTube video ID or null if not found.
 */
const getYoutubeVideoId = (url: string): string | null => {
    if (!url) return null;
    // Standard watch URL: https://www.youtube.com/watch?v=VIDEO_ID
    // Short URL: https://youtu.be/VIDEO_ID
    // Embed URL: https://www.youtube.com/embed/VIDEO_ID
    // Playlist URL (extract video ID): https://www.youtube.com/watch?v=VIDEO_ID&list=...
    // Mobile URL: https://m.youtube.com/watch?v=VIDEO_ID
    const patterns = [
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:watch\?v=|embed\/|v\/|)([-\w]+)/,
        /(?:https?:\/\/)?youtu\.be\/([-\w]+)/,
        /(?:https?:\/\/)?m\.youtube\.com\/watch\?v=([-\w]+)/,
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }
    return null;
};

/**
 * Extracts Vimeo video ID from various URL formats.
 * @param url The URL to parse.
 * @returns The Vimeo video ID or null if not found.
 */
const getVimeoVideoId = (url: string): string | null => {
    if (!url) return null;
    const patterns = [
        /(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(\d+)/,
        /(?:https?:\/\/)?player\.vimeo\.com\/video\/(\d+)/,
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }
    return null;
};

/**
 * Extracts Loom video ID from URL.
 * @param url The URL to parse.
 * @returns The Loom video ID or null if not found.
 */
const getLoomVideoId = (url: string): string | null => {
    if (!url) return null;
    const pattern = /(?:https?:\/\/)?(?:www\.)?loom\.com\/share\/([\w-]+)/;
    const match = url.match(pattern);
    return match ? match[1] : null;
};

/**
 * Renders a video component, supporting both direct links and embeds for YouTube, Vimeo, and Loom.
 */
export const renderVideo = (
  component: ComponentInstance,
  baseStyles: React.CSSProperties,
  containerRef: React.RefObject<HTMLDivElement>,
  isEditing?: boolean
) => {
  const props = component.props;
  
  const {
    src,
    autoplay = false,
    controls = true,
    loop = false,
    muted = false,
    poster = "",
    objectFit = "contain",
    borderRadius = 0,
    borderWidth = 0,
    borderColor = "#000000",
    shadow = false,
    shadowBlur = 10,
    shadowColor = "rgba(0,0,0,0.3)",
    shadowOffsetX = 0,
    shadowOffsetY = 4,
    shadowSpread = 0
  } = props;
  
  // Create container styles
  const containerStyles: React.CSSProperties = {
    ...baseStyles, 
    width: "100%",
    height: "100%",
    overflow: "hidden",
    borderRadius: `${borderRadius}px`,
    border: borderWidth > 0 ? `${borderWidth}px solid ${borderColor}` : "none",
    boxShadow: shadow ? `${shadowOffsetX}px ${shadowOffsetY}px ${shadowBlur}px ${shadowSpread}px ${shadowColor}` : "none",
    backgroundColor: poster ? "transparent" : "#000000",
    position: 'relative'
  };

  // Create an overlay to prevent interaction in edit mode
  const overlayStyles: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    zIndex: 10,
    cursor: 'grab',
    backgroundColor: 'transparent'
  };
  
  // Check if the video source is provided
  if (!src) {
    return (
      <div 
        ref={containerRef} 
        style={{
          ...containerStyles,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f0f0f0",
          color: "#888888",
          fontSize: "14px",
          pointerEvents: 'none'
        }}
      >
        Video source not provided
      </div>
    );
  }

  // Check for video platform IDs
  const youtubeVideoId = getYoutubeVideoId(src);
  const vimeoVideoId = getVimeoVideoId(src);
  const loomVideoId = getLoomVideoId(src);

  // Common iframe styles
  const iframeStyles: React.CSSProperties = {
    position: 'absolute', 
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    border: 'none',
  };

  // Render YouTube iframe
  if (youtubeVideoId) {
    const embedParams = new URLSearchParams({
        autoplay: autoplay ? '1' : '0',
        controls: controls ? '1' : '0',
        loop: loop ? '1' : '0',
        mute: muted ? '1' : '0',
        playsinline: '1', 
        modestbranding: '1', 
        rel: '0' 
    });

    if (loop) {
        embedParams.set('playlist', youtubeVideoId);
    }

    const embedUrl = `https://www.youtube.com/embed/${youtubeVideoId}?${embedParams.toString()}`;

    return (
      <div ref={containerRef} style={containerStyles} className="video-container youtube-embed">
        <iframe
          src={embedUrl}
          style={iframeStyles}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          title={`YouTube video player ${youtubeVideoId}`}
        />
        {isEditing && <div style={overlayStyles} />}
      </div>
    );
  }

  // Render Vimeo iframe
  if (vimeoVideoId) {
    const embedParams = new URLSearchParams({
        autoplay: autoplay ? '1' : '0',
        loop: loop ? '1' : '0',
        muted: muted ? '1' : '0',
        playsinline: '1',
        controls: controls ? '1' : '0'
    });

    const embedUrl = `https://player.vimeo.com/video/${vimeoVideoId}?${embedParams.toString()}`;

    return (
      <div ref={containerRef} style={containerStyles} className="video-container vimeo-embed">
        <iframe
          src={embedUrl}
          style={iframeStyles}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          title={`Vimeo video player ${vimeoVideoId}`}
        />
        {isEditing && <div style={overlayStyles} />}
      </div>
    );
  }

  // Render Loom iframe
  if (loomVideoId) {
    const embedParams = new URLSearchParams({
        autoplay: autoplay ? 'true' : 'false',
        hideEmbedTopBar: 'true',
        hide_share: 'true',
        hide_title: 'true',
        hideEmbedBottomBar: controls ? 'false' : 'true'
    });

    const embedUrl = `https://www.loom.com/embed/${loomVideoId}?${embedParams.toString()}`;

    return (
      <div ref={containerRef} style={containerStyles} className="video-container loom-embed">
        <iframe
          src={embedUrl}
          style={iframeStyles}
          allow="autoplay; fullscreen"
          allowFullScreen
          title={`Loom video player ${loomVideoId}`}
        />
        {isEditing && <div style={overlayStyles} />}
      </div>
    );
  }

  // Render standard HTML video for direct links
  const videoTagStyles: React.CSSProperties = {
    display: 'block',
    width: "100%",
    height: "100%",
    objectFit: objectFit as "cover" | "contain" | "fill" | "none" | "scale-down",
  };

  return (
    <div ref={containerRef} style={containerStyles} className="video-container direct-link">
      <video 
        src={src}
        poster={poster}
        controls={!isEditing && controls}
        autoPlay={!isEditing && autoplay}
        loop={loop}
        muted={muted}
        preload="metadata"
        playsInline
        style={videoTagStyles}
        onError={(e) => {
          // Handle video loading errors
          const target = e.target as HTMLVideoElement;
          target.onerror = null; // Prevent infinite error loop
          target.style.display = "none";
          
          // Create and append error message
          const errorDiv = document.createElement('div');
          errorDiv.style.width = "100%";
          errorDiv.style.height = "100%";
          errorDiv.style.display = "flex";
          errorDiv.style.alignItems = "center";
          errorDiv.style.justifyContent = "center";
          errorDiv.style.backgroundColor = "#f8d7da";
          errorDiv.style.color = "#721c24";
          errorDiv.style.padding = "10px";
          errorDiv.style.textAlign = "center";
          errorDiv.textContent = "Failed to load video";
          
          target.parentNode?.appendChild(errorDiv);
        }}
      />
      {isEditing && <div style={overlayStyles} />}
    </div>
  );
};

// Register the renderer
import { registerRenderer } from '../utils';
import type { RendererFunction, RendererProps } from '../index';

// Wrapper function to match the expected signature
const VideoRendererWrapper: RendererFunction = (props: RendererProps) => {
  return renderVideo(props.component, props.styles || {}, props.containerRef, props.isEditing);
};

// Register the wrapped renderer
registerRenderer('Video', VideoRendererWrapper); 