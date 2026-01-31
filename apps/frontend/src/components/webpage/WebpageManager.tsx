import React, { useEffect, useState, useCallback } from 'react';
import {
  webpageApi,
  type PublishedWebpage,
  type WebpageLead,
} from '@/services/webpageApi';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Globe,
  Eye,
  Users,
  Copy,
  Check,
  ExternalLink,
  Trash2,
  Loader2,
  Calendar,
  Mail,
  User,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface WebpageManagerProps {
  className?: string;
}

// ============================================================================
// Webpage Card
// ============================================================================

interface WebpageCardProps {
  webpage: PublishedWebpage;
  onUnpublish: (id: string) => void;
  onViewLeads: (id: string) => void;
}

function WebpageCard({ webpage, onUnpublish, onViewLeads }: WebpageCardProps) {
  const [copied, setCopied] = useState(false);
  const fullUrl = `${window.location.origin}/s/${webpage.slug}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formattedDate = new Date(webpage.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="border rounded-lg p-4 bg-card hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-sm truncate">{webpage.title}</h3>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            /s/{webpage.slug}
          </p>
        </div>
        <span
          className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
            webpage.is_published
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
              : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
          }`}
        >
          {webpage.is_published ? 'Live' : 'Unpublished'}
        </span>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Eye className="h-3.5 w-3.5" />
          <span>{webpage.view_count} views</span>
        </div>
        <div className="flex items-center gap-1">
          <Users className="h-3.5 w-3.5" />
          <span>{webpage.lead_count} leads</span>
        </div>
        <div className="flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5" />
          <span>{formattedDate}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t">
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open(`/s/${webpage.slug}`, '_blank')}
          className="h-8 text-xs"
        >
          <ExternalLink className="h-3.5 w-3.5 mr-1" />
          View
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className="h-8 text-xs"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 mr-1" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5 mr-1" />
              Copy Link
            </>
          )}
        </Button>
        {webpage.lead_count > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onViewLeads(webpage.id)}
            className="h-8 text-xs"
          >
            <Mail className="h-3.5 w-3.5 mr-1" />
            Leads
          </Button>
        )}
        {webpage.is_published && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onUnpublish(webpage.id)}
            className="h-8 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 ml-auto"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Leads Dialog
// ============================================================================

interface LeadsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  webpageId: string;
}

function LeadsDialog({ open, onOpenChange, webpageId }: LeadsDialogProps) {
  const [leads, setLeads] = useState<WebpageLead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && webpageId) {
      setLoading(true);
      webpageApi
        .getLeads(webpageId)
        .then(setLeads)
        .catch(() => setLeads([]))
        .finally(() => setLoading(false));
    }
  }, [open, webpageId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-500" />
            Collected Leads
          </DialogTitle>
          <DialogDescription>
            {leads.length} {leads.length === 1 ? 'person' : 'people'} submitted their email.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : leads.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No leads yet.
          </p>
        ) : (
          <div className="space-y-2">
            {leads.map((lead) => (
              <div
                key={lead.id}
                className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30"
              >
                <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {lead.name || 'Anonymous'}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {lead.email}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {new Date(lead.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Main WebpageManager Component
// ============================================================================

export default function WebpageManager({ className }: WebpageManagerProps) {
  const { toast } = useToast();
  const [webpages, setWebpages] = useState<PublishedWebpage[]>([]);
  const [loading, setLoading] = useState(true);
  const [leadsDialogOpen, setLeadsDialogOpen] = useState(false);
  const [selectedWebpageId, setSelectedWebpageId] = useState('');

  const loadWebpages = useCallback(async () => {
    try {
      const data = await webpageApi.listWebpages();
      setWebpages(data);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWebpages();
  }, [loadWebpages]);

  const handleUnpublish = async (id: string) => {
    try {
      await webpageApi.unpublishWebpage(id);
      setWebpages((prev) =>
        prev.map((w) => (w.id === id ? { ...w, is_published: false } : w))
      );
      toast({ title: 'Webpage unpublished' });
    } catch {
      toast({ title: 'Failed to unpublish', variant: 'destructive' });
    }
  };

  const handleViewLeads = (id: string) => {
    setSelectedWebpageId(id);
    setLeadsDialogOpen(true);
  };

  if (loading) {
    return (
      <div className={`flex justify-center py-8 ${className || ''}`}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (webpages.length === 0) {
    return (
      <div className={`text-center py-8 ${className || ''}`}>
        <Globe className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">
          No published webpages yet
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Open a deck and click "Publish as Webpage" to get started.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="space-y-3">
        {webpages.map((webpage) => (
          <WebpageCard
            key={webpage.id}
            webpage={webpage}
            onUnpublish={handleUnpublish}
            onViewLeads={handleViewLeads}
          />
        ))}
      </div>

      <LeadsDialog
        open={leadsDialogOpen}
        onOpenChange={setLeadsDialogOpen}
        webpageId={selectedWebpageId}
      />
    </div>
  );
}
