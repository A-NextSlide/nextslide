import React, { useMemo } from 'react';
import { DeckVersion } from '@/types/VersionTypes';
import { History, Archive, Clock, Bookmark, Save, RefreshCw, Layers, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

interface VersionNode {
  version: DeckVersion;
  children: VersionNode[];
  depth: number;
  isMainBranch: boolean;
}

interface VersionHistoryTreeProps {
  versions: DeckVersion[];
  selectedVersionId?: string | null;
  onVersionSelect: (version: DeckVersion) => void;
  onVersionRestore: (versionId: string) => void;
  onVersionRename: (versionId: string, newName: string) => void;
  onVersionBookmark: (version: DeckVersion) => void;
  className?: string;
}

const VersionHistoryTree: React.FC<VersionHistoryTreeProps> = ({
  versions,
  selectedVersionId,
  onVersionSelect,
  onVersionRestore,
  onVersionRename,
  onVersionBookmark,
  className
}) => {
  // Build tree structure from versions
  const versionTree = useMemo(() => {
    const versionMap = new Map<string, VersionNode>();
    const rootVersions: VersionNode[] = [];

    // First pass: create all nodes
    versions.forEach(version => {
      versionMap.set(version.id, {
        version,
        children: [],
        depth: 0,
        isMainBranch: !version.parent_version_id
      });
    });

    // Second pass: build tree structure
    versions.forEach(version => {
      const node = versionMap.get(version.id)!;
      if (version.parent_version_id) {
        const parent = versionMap.get(version.parent_version_id);
        if (parent) {
          parent.children.push(node);
          node.depth = parent.depth + 1;
          node.isMainBranch = parent.isMainBranch && parent.children.length === 1;
        } else {
          rootVersions.push(node);
        }
      } else {
        rootVersions.push(node);
      }
    });

    // Sort by creation date (newest first)
    const sortNodes = (nodes: VersionNode[]) => {
      nodes.sort((a, b) => 
        new Date(b.version.created_at).getTime() - new Date(a.version.created_at).getTime()
      );
      nodes.forEach(node => sortNodes(node.children));
    };

    sortNodes(rootVersions);
    return rootVersions;
  }, [versions]);

  const renderVersionNode = (node: VersionNode, isLast: boolean = false, parentPath: boolean[] = []) => {
    const { version } = node;
    const isSelected = selectedVersionId === version.id;
    const isBookmarked = version.metadata?.bookmarked;
    const isAutoSave = version.is_auto_save;

    return (
      <div key={version.id} className="relative">
        {/* Branch lines */}
        <div className="absolute left-0 top-0 bottom-0 w-6">
          {/* Vertical line from parent */}
          {parentPath.length > 0 && (
            <div 
              className={cn(
                "absolute left-3 top-0 w-0.5 bg-border",
                isLast ? "h-6" : "h-full"
              )} 
            />
          )}
          
          {/* Horizontal line to commit */}
          {parentPath.length > 0 && (
            <div className="absolute left-3 top-6 w-3 h-0.5 bg-border" />
          )}
          
          {/* Continue parent lines */}
          {parentPath.map((continues, index) => {
            if (!continues || index === parentPath.length - 1) return null;
            const leftOffset = 3 + (index * 24);
            return (
              <div
                key={index}
                className="absolute top-0 bottom-0 w-0.5 bg-border"
                style={{ left: `${leftOffset}px` }}
              />
            );
          })}
        </div>

        {/* Version item */}
        <div 
          className={cn(
            "group relative flex items-start gap-3 py-2 px-3 rounded-lg cursor-pointer transition-all ml-6",
            "hover:bg-accent/50",
            isSelected && "bg-accent",
            isAutoSave && "opacity-60"
          )}
          style={{ marginLeft: `${node.depth * 24 + 24}px` }}
          onClick={() => onVersionSelect(version)}
        >
          {/* Commit icon */}
          <div className={cn(
            "mt-1 rounded-full p-1.5 transition-colors",
            isBookmarked ? "bg-primary text-primary-foreground" : "bg-muted",
            isAutoSave && "bg-muted/50"
          )}>
            {isAutoSave ? (
              <RefreshCw className="w-3 h-3" />
            ) : isBookmarked ? (
              <Bookmark className="w-3 h-3" />
            ) : (
              <Layers className="w-3 h-3" />
            )}
          </div>

          {/* Version details */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className={cn(
                "font-medium text-sm truncate",
                isAutoSave && "text-muted-foreground"
              )}>
                {version.version_name}
              </h4>
              {isAutoSave && (
                <span className="text-xs text-muted-foreground">(autosave)</span>
              )}
            </div>
            
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(version.created_at), { addSuffix: true })}
              </span>
              {version.metadata?.description && (
                <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                  {version.metadata.description}
                </span>
              )}
            </div>

            {/* Action buttons - visible on hover */}
            <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        onVersionRestore(version.id);
                      }}
                    >
                      Restore
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Restore this version</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        onVersionBookmark(version);
                      }}
                    >
                      <Bookmark className={cn(
                        "w-3 h-3",
                        isBookmarked && "fill-current"
                      )} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{isBookmarked ? 'Remove bookmark' : 'Bookmark version'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          {/* Version number badge */}
          <div className="text-xs text-muted-foreground font-mono">
            v{version.version_number}
          </div>
        </div>

        {/* Render children */}
        {node.children.map((child, index) => 
          renderVersionNode(
            child, 
            index === node.children.length - 1,
            [...parentPath, !isLast]
          )
        )}
      </div>
    );
  };

  return (
    <div className={cn("relative", className)}>
      {versionTree.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Layers className="w-8 h-8 mx-auto mb-2 opacity-20" />
          <p className="text-sm">No version history yet</p>
          <p className="text-xs mt-1">Save your first version to start tracking changes</p>
        </div>
      ) : (
        <div className="space-y-1">
          {versionTree.map((node, index) => 
            renderVersionNode(node, index === versionTree.length - 1)
          )}
        </div>
      )}
    </div>
  );
};

export default VersionHistoryTree; 