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
        {/* Version item - compact design */}
        <div
          className={cn(
            "group relative flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer transition-all",
            "hover:bg-accent/50 border border-transparent",
            isSelected && "bg-accent border-accent-foreground/10",
            isAutoSave && "opacity-70"
          )}
          style={{ marginLeft: `${node.depth * 12}px` }}
          onClick={() => onVersionSelect(version)}
        >
          {/* Icon indicator */}
          <div className={cn(
            "flex-shrink-0 rounded p-1 transition-colors",
            isBookmarked ? "bg-primary/10 text-primary" : "bg-muted/50 text-muted-foreground",
            isAutoSave && "bg-muted/30"
          )}>
            {isAutoSave ? (
              <RefreshCw className="w-3 h-3" />
            ) : isBookmarked ? (
              <Bookmark className="w-3 h-3 fill-current" />
            ) : (
              <Layers className="w-3 h-3" />
            )}
          </div>

          {/* Version details - single line layout */}
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <h4 className={cn(
              "font-medium text-xs truncate max-w-[120px]",
              isAutoSave && "text-muted-foreground"
            )}>
              {version.version_name}
            </h4>
            <span className="text-[10px] text-muted-foreground truncate">
              {formatDistanceToNow(new Date(version.created_at), { addSuffix: true })}
            </span>
          </div>

          {/* Action buttons - visible on hover, inline */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 px-1.5 text-[10px]"
                    onClick={(e) => {
                      e.stopPropagation();
                      onVersionRestore(version.id);
                    }}
                  >
                    Restore
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  <p>Restore this version</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Version number badge - subtle */}
          <span className="text-[10px] text-muted-foreground/60 font-mono flex-shrink-0">
            v{version.version_number}
          </span>
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
        <div className="text-center py-6 text-muted-foreground">
          <Layers className="w-6 h-6 mx-auto mb-1.5 opacity-20" />
          <p className="text-xs">No version history yet</p>
          <p className="text-[10px] mt-0.5 opacity-70">Save your first version to start tracking changes</p>
        </div>
      ) : (
        <div className="space-y-0.5">
          {versionTree.map((node, index) =>
            renderVersionNode(node, index === versionTree.length - 1)
          )}
        </div>
      )}
    </div>
  );
};

export default VersionHistoryTree; 