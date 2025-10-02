import React from 'react';
import { TaggedMedia } from '@/types/SlideTypes';
import { ImageIcon, BarChart3, FileText, FileIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface TaggedMediaViewerProps {
  taggedMedia: TaggedMedia[];
}

const TaggedMediaViewer: React.FC<TaggedMediaViewerProps> = ({ taggedMedia }) => {
  if (!taggedMedia || taggedMedia.length === 0) {
    return (
      <div className="p-4 text-xs text-zinc-400 dark:text-zinc-500 italic text-center">
        No tagged media available
      </div>
    );
  }

  return (
    <div className="p-2">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-medium text-pink-600 dark:text-pink-400 flex items-center">
          <ImageIcon className="h-3 w-3 mr-1" />
          Tagged Media ({taggedMedia.length})
        </h4>
      </div>
      
      <div className="space-y-3">
        {taggedMedia.map((media, index) => (
          <div
            key={media.id}
            className="border border-pink-200 dark:border-pink-800 rounded-lg p-3 bg-pink-50/50 dark:bg-pink-900/20"
          >
            {/* Full-width image preview at the top */}
            {(() => {
              // Check if this is an image file based on filename or type
              const isImageFile = media.type === 'image' || 
                                media.type === 'other' && (
                                  media.filename?.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp|svg)$/i) ||
                                  false
                                );
              
              if (!isImageFile) return null;
              
              // Check for various URL fields that might contain the image
              const mediaAny = media as any;
              const imageUrl = media.previewUrl || 
                             mediaAny.url || 
                             (typeof media.content === 'string' && media.content.startsWith('http') ? media.content : '') ||
                             mediaAny.metadata?.url ||
                             mediaAny.metadata?.previewUrl;
              
              return imageUrl ? (
                <div className="mb-3">
                  <img
                    src={imageUrl}
                    alt={media.filename}
                    className="w-full h-48 object-contain rounded-md border border-pink-300 dark:border-pink-700 bg-white dark:bg-zinc-900"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      if (target.src !== '/placeholder.svg') {
                        target.src = '/placeholder.svg';
                      }
                    }}
                  />
                </div>
              ) : null;
            })()}
            
            {/* Media Header */}
            <div className="flex items-center gap-2 mb-2">
              {media.type === 'image' ? (
                <ImageIcon className="h-4 w-4 text-pink-500 dark:text-pink-400" />
              ) : media.type === 'chart' || media.type === 'data' ? (
                <BarChart3 className="h-4 w-4 text-purple-500 dark:text-purple-400" />
              ) : media.type === 'pdf' ? (
                <FileText className="h-4 w-4 text-red-500 dark:text-red-400" />
              ) : (
                <FileIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              )}
              <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">
                {media.filename}
              </span>
              {media.status === 'pending' && (
                <div className="ml-1 w-2 h-2 rounded-full bg-yellow-500 animate-pulse" title="Processing..." />
              )}
            </div>
            
            {/* AI Analysis - Now with proper markdown rendering */}
            <div className="mt-2 p-3 bg-white/70 dark:bg-black/30 rounded-md">
              <h5 className="text-xs font-semibold text-pink-600 dark:text-pink-400 mb-2">
                AI Analysis:
              </h5>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({children}) => <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-2 leading-relaxed">{children}</p>,
                    h1: ({children}) => <h1 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 mt-2 mb-1">{children}</h1>,
                    h2: ({children}) => <h2 className="text-xs font-bold text-zinc-700 dark:text-zinc-300 mt-2 mb-1">{children}</h2>,
                    h3: ({children}) => <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mt-2 mb-1">{children}</h3>,
                    ul: ({children}) => <ul className="text-xs text-zinc-600 dark:text-zinc-400 ml-4 list-disc space-y-1">{children}</ul>,
                    ol: ({children}) => <ol className="text-xs text-zinc-600 dark:text-zinc-400 ml-4 list-decimal space-y-1">{children}</ol>,
                    li: ({children}) => <li className="text-xs text-zinc-600 dark:text-zinc-400">{children}</li>,
                    strong: ({children}) => <strong className="font-semibold text-zinc-700 dark:text-zinc-300">{children}</strong>,
                    em: ({children}) => <em className="italic">{children}</em>,
                    blockquote: ({children}) => <blockquote className="border-l-2 border-pink-300 dark:border-pink-700 pl-2 my-2 text-xs">{children}</blockquote>,
                    code: ({node, ...props}: any) => {
                      const inline = !node?.position;
                      return inline ? (
                        <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded text-xs" {...props} />
                      ) : (
                        <pre className="bg-zinc-100 dark:bg-zinc-800 p-2 rounded overflow-x-auto"><code className="text-xs" {...props} /></pre>
                      );
                    }
                  }}
                >
                  {media.interpretation || "Processing media analysis..."}
                </ReactMarkdown>
              </div>
              
              {/* Metadata if available */}
              {media.metadata && Object.keys(media.metadata).length > 0 && (
                <div className="mt-3 pt-3 border-t border-pink-200 dark:border-pink-800">
                  <div className="space-y-1">
                    {media.metadata.componentType && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-pink-600 dark:text-pink-400 font-medium">Component:</span>
                        <span className="text-zinc-600 dark:text-zinc-400">{media.metadata.componentType}</span>
                      </div>
                    )}
                    {media.metadata.chartType && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-pink-600 dark:text-pink-400 font-medium">Chart Type:</span>
                        <span className="text-zinc-600 dark:text-zinc-400">{media.metadata.chartType}</span>
                      </div>
                    )}
                    {media.metadata.dimensions && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-pink-600 dark:text-pink-400 font-medium">Dimensions:</span>
                        <span className="text-zinc-600 dark:text-zinc-400">
                          {media.metadata.dimensions.width} × {media.metadata.dimensions.height}
                        </span>
                      </div>
                    )}
                    {media.metadata.fileSize && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-pink-600 dark:text-pink-400 font-medium">Size:</span>
                        <span className="text-zinc-600 dark:text-zinc-400">
                          {(media.metadata.fileSize / 1024).toFixed(1)} KB
                        </span>
                      </div>
                    )}
                    {media.metadata.suggestedUse && (
                      <div className="flex items-start gap-2 text-xs">
                        <span className="text-pink-600 dark:text-pink-400 font-medium">Suggested Use:</span>
                        <span className="text-zinc-600 dark:text-zinc-400">{media.metadata.suggestedUse}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TaggedMediaViewer; 