import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../ui/button';
import {
  Share2,
  Link,
  Mail,
  Copy,
  Eye,
  Edit,
  Trash2,
  Users,
  Clock,
  BarChart3,
  Check,
  QrCode,
  Shield,
  X,
  UserPlus,
  AlertCircle,
  Calendar,
  Lock,
  Unlock,
  Settings,
  ExternalLink,
  Loader2,
  Download,
  Smartphone,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  FileText,
  Activity,
  Timer,
  MapPin,
  Monitor,
  Globe
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { trackDeckShared } from '@/services/analytics';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { shareService, ShareLink, ApiResponse, CollaboratorResponse, ShareAnalytics, ShareViewer } from '@/services/shareService';
import { mockShareService } from '@/services/mockShareService';
import { generateShareOGImage, findSlideElement, findAnySlideElement } from '@/utils/ogImageCapture';
import { formatDistanceToNow } from 'date-fns';
import { useDeckStore } from '@/stores/deckStore';
import { Switch } from '../ui/switch';
import { Separator } from '../ui/separator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { cn } from '@/lib/utils';
import QRCode from 'qrcode';
import { useAuth } from '@/context/SupabaseAuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { communityService, COMMUNITY_CATEGORIES, SubmissionStatus } from '@/services/communityService';
import { Textarea } from '../ui/textarea';

interface DeckSharingProps {
  deckUuid: string;
  deckName: string;
}

interface Collaborator {
  id: string;
  email: string;
  userExists: boolean;
  shareLink: string;
  addedAt: string;
  status: 'invited' | 'active';
  lastAccessed?: string;
  accessCount?: number;
  permissions?: string[];
}

interface ShareLinkExtended extends ShareLink {
  password?: string;
  max_uses?: number;
  used_count?: number;
  name?: string;
  require_email?: boolean;
}



const DeckSharing: React.FC<DeckSharingProps> = ({ deckUuid, deckName }) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'links' | 'collaborators' | 'analytics' | 'community'>('links');

  // Community submission state
  const [communityTitle, setCommunityTitle] = useState(deckName);
  const [communityDescription, setCommunityDescription] = useState('');
  const [communityCategory, setCommunityCategory] = useState<string>('business');
  const [communityTags, setCommunityTags] = useState('');
  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [shareLinks, setShareLinks] = useState<ShareLinkExtended[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [collaboratorEmail, setCollaboratorEmail] = useState('');
  const inviteInputRef = useRef<HTMLInputElement | null>(null);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [invitedEmails, setInvitedEmails] = useState<Set<string>>(new Set());
  
  // Share creation state
  const [shareType, setShareType] = useState<'view' | 'edit'>('view');
  const [expiresIn, setExpiresIn] = useState<string>('never');
  const [requirePassword, setRequirePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [maxUses, setMaxUses] = useState<number | undefined>(undefined);
  const [requireEmail, setRequireEmail] = useState(true);
  
  // Edit mode states
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [editingLink, setEditingLink] = useState<ShareLinkExtended | null>(null);

  // QR Code state
  const [showQRCode, setShowQRCode] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [selectedQRLink, setSelectedQRLink] = useState<ShareLink | null>(null);
  const [isGeneratingQR, setIsGeneratingQR] = useState(false);

  // Analytics state
  const [selectedLinkForAnalytics, setSelectedLinkForAnalytics] = useState<ShareLink | null>(null);
  const [analyticsData, setAnalyticsData] = useState<ShareAnalytics | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);

  // Viewers state (emails collected)
  const [viewers, setViewers] = useState<ShareViewer[]>([]);
  const [isLoadingViewers, setIsLoadingViewers] = useState(false);

  // Load existing share links and collaborators when dialog opens
  useEffect(() => {
    if (isOpen) {
      loadShareData();
    }
  }, [isOpen]);

  // Check community status when switching to community tab
  useEffect(() => {
    if (isOpen && activeTab === 'community') {
      checkCommunityStatus();
      // Pre-fill title with deck name if not already set
      if (!submissionStatus && communityTitle === 'New presentation') {
        setCommunityTitle(deckName);
      }
    }
  }, [isOpen, activeTab]);

  // Update community title when deckName changes
  useEffect(() => {
    if (!submissionStatus) {
      setCommunityTitle(deckName);
    }
  }, [deckName]);

  // Allow opening this dialog via global event from header popover
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      // On mobile, don't respond to open-deck-sharing - MobileShareSheet handles it
      // Only respond on desktop
      if (isMobile) return;

      try {
        const tab = e.detail?.tab as 'links' | 'collaborators' | 'analytics' | undefined;
        const focusInvite = Boolean(e.detail?.focusInvite);
        setActiveTab(tab || 'links');
        setIsOpen(true);
        // Focus invite input shortly after open
        if (focusInvite) {
          setTimeout(() => inviteInputRef.current?.focus(), 50);
        }
      } catch {}
    };
    // Handler for full dialog (from mobile advanced options) - always respond
    const fullHandler = () => {
      setActiveTab('links');
      setIsOpen(true);
    };
    window.addEventListener('open-deck-sharing', handler as EventListener);
    window.addEventListener('open-deck-sharing-full', fullHandler as EventListener);
    return () => {
      window.removeEventListener('open-deck-sharing', handler as EventListener);
      window.removeEventListener('open-deck-sharing-full', fullHandler as EventListener);
    };
  }, [isMobile]);

  const loadShareData = async () => {
    setIsLoading(true);
    try {
      // Load share links
      let response = await shareService.getShareLinks(deckUuid);
      
      if (!response.success && response.error?.includes('401')) {
        console.log('[DeckSharing] Backend authentication failed, using mock service');
        response = await mockShareService.getShareLinks(deckUuid);
      }
      
      if (response.success && response.data) {
        const links = Array.isArray(response.data) ? response.data : [];
        setShareLinks(links);
      }

      // Load collaborators - this would come from a separate API endpoint
      await loadCollaborators();
    } finally {
      setIsLoading(false);
    }
  };

  const loadCollaborators = async () => {
    // TODO: This needs a backend endpoint to fetch existing collaborators
    // For now, we'll use local storage to persist collaborators
    const savedCollaborators = localStorage.getItem(`deck_collaborators_${deckUuid}`);
    if (savedCollaborators) {
      try {
        const parsed: Collaborator[] = JSON.parse(savedCollaborators);
        setCollaborators(parsed);
        const emails = new Set(parsed.map((c) => c.email));
        setInvitedEmails(emails);
      } catch (e) {
        console.error('Failed to parse saved collaborators:', e);
      }
    }
  };

  const saveCollaborators = (updatedCollaborators: Collaborator[]) => {
    setCollaborators(updatedCollaborators);
    const emails = new Set(updatedCollaborators.map(c => c.email));
    setInvitedEmails(emails);
    localStorage.setItem(`deck_collaborators_${deckUuid}`, JSON.stringify(updatedCollaborators));
  };

  // Basic role gating using local storage team settings (temporary until backend)
  const getIsAdmin = (): boolean => {
    try {
      const currentEmail = user?.email || '';
      const raw = localStorage.getItem('team_members');
      if (!raw) return true; // default to admin if no team configured
      const team = JSON.parse(raw) as { email: string; role: 'admin' | 'member' }[];
      const me = team.find(m => m.email?.toLowerCase() === currentEmail.toLowerCase());
      return (me?.role || 'admin') === 'admin';
    } catch {
      return true;
    }
  };
  const isAdmin = getIsAdmin();

  const handleCreateShareLink = async () => {
    setIsLoading(true);
    try {
      const expiresInHours = expiresIn === 'never' ? undefined : parseInt(expiresIn);
      const request: any = {
        share_type: shareType,
        expires_in_hours: expiresInHours,
        require_email: requireEmail
      };

      // Add password and max uses if enabled
      if (requirePassword && password) {
        request.password = password;
      }
      if (maxUses) {
        request.max_uses = maxUses;
      }

      let response = await shareService.createShareLink(deckUuid, request);

      if (!response.success && (response.error?.includes('422') || response.error?.includes('401'))) {
        console.log('[DeckSharing] Backend failed, using mock service');
        response = await mockShareService.createShareLink(deckUuid, request);
      }

      if (response.success && response.data) {
        // Track share link created in PostHog
        trackDeckShared({ deckId: deckUuid, shareType: 'link' });

        toast({
          title: "Share link created",
          description: "Your share link has been created successfully",
        });

        const fullUrl = mockShareService.getShareUrl(response.data.short_code, shareType);
        await navigator.clipboard.writeText(fullUrl);

        toast({
          title: "Link copied",
          description: "Share link has been copied to clipboard",
        });

        // Capture OG thumbnail for the first slide (async, non-blocking)
        captureAndUploadOGThumbnail(
          response.data.id,
          response.data.short_code
        );

        // Reset form
        setPassword('');
        setRequirePassword(false);
        setMaxUses(undefined);
        setRequireEmail(false);

        await loadShareData();
      } else {
        toast({
          title: "Error creating share link",
          description: response.error || "An error occurred",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create share link",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Captures a slide as an OG thumbnail and uploads it.
   * Uses improved slide finding that prefers larger (main) slides over thumbnails.
   * Runs in background, non-blocking.
   */
  const captureAndUploadOGThumbnail = async (shareId: string, shortCode: string) => {
    try {
      // Get slides from deck store
      const deckData = useDeckStore.getState().deckData;
      const slides = deckData?.slides || [];

      if (slides.length === 0) {
        console.log('[DeckSharing] No slides to capture for OG image');
        return;
      }

      // Use improved slide finding - prefers larger slides (main editor) over thumbnails
      const firstSlideId = slides[0].id;
      let slideElement = findSlideElement(firstSlideId);

      // If first slide not found, try to find any slide
      if (!slideElement) {
        slideElement = findAnySlideElement();
      }

      if (!slideElement) {
        console.log('[DeckSharing] No slide element found in DOM for OG capture');
        return;
      }

      console.log('[DeckSharing] Capturing OG image from slide:', slideElement.getAttribute('data-slide-id'));

      // Generate and upload the OG image
      const ogImageUrl = await generateShareOGImage(slideElement, shortCode);

      if (ogImageUrl) {
        // Update share metadata with the OG image URL
        await shareService.updateShareMetadata(shareId, {
          og_image_url: ogImageUrl,
        });
        console.log('[DeckSharing] OG image saved:', ogImageUrl);
      } else {
        console.log('[DeckSharing] OG capture returned null - using backend fallback');
      }
    } catch (error) {
      // Non-blocking - just log the error
      console.error('[DeckSharing] Failed to capture OG thumbnail:', error);
    }
  };

  const handleAddCollaborator = async () => {
    if (!collaboratorEmail) return;

    // Check if already invited
    if (invitedEmails.has(collaboratorEmail)) {
      toast({
        title: "Already invited",
        description: `${collaboratorEmail} has already been invited to collaborate`,
        variant: "destructive"
      });
      return;
    }
    
    setIsLoading(true);
    try {
      let response = await shareService.addCollaborator(deckUuid, collaboratorEmail);
      
      if (!response.success && (response.error?.includes('422') || response.error?.includes('401'))) {
        console.log('[DeckSharing] Backend failed, using mock service for collaborator');
        response = await mockShareService.addCollaborator(deckUuid, collaboratorEmail) as ApiResponse<CollaboratorResponse>;
      }
      
      if (response.success && response.data) {
        const data = response.data;
        
        // Add collaborator to local state
        const newCollaborator: Collaborator = {
          id: data.user_id || `temp-${Date.now()}`,
          email: data.collaborator_email,
          userExists: data.collaborator_exists,
          shareLink: data.share_link.full_url,
          addedAt: new Date().toISOString(),
          status: data.collaborator_exists ? 'active' : 'invited',
          permissions: ['view', 'edit']
        };
        
        const updatedCollaborators = [...collaborators, newCollaborator];
        saveCollaborators(updatedCollaborators);
        
        // Show appropriate message
        if (data.collaborator_exists) {
          toast({
            title: "Collaborator added",
            description: `${data.collaborator_email} has been added as a collaborator`,
          });
        } else if (data.invitation_sent) {
          toast({
            title: "Invitation sent",
            description: `An invitation email has been sent to ${data.collaborator_email}`,
          });
        } else {
          const fullUrl = `${window.location.origin}${data.share_link.full_url}`;
          await navigator.clipboard.writeText(fullUrl);
          toast({
            title: "Share link created",
            description: `Share link copied for ${data.collaborator_email}`,
          });
        }
        
        setCollaboratorEmail('');
        await loadShareData();
      } else {
        toast({
          title: "Error inviting collaborator",
          description: response.error || "An error occurred",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to invite collaborator",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveCollaborator = async (collaboratorId: string) => {
    const collaborator = collaborators.find(c => c.id === collaboratorId);
    if (!collaborator) return;

    setIsLoading(true);
    try {
      // TODO: Call backend API to remove collaborator
      // For now, just remove from local state
      const updatedCollaborators = collaborators.filter(c => c.id !== collaboratorId);
      saveCollaborators(updatedCollaborators);
      
      toast({
        title: "Collaborator removed",
        description: `${collaborator.email} has been removed from this deck`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to remove collaborator",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLink = async (link: ShareLink) => {
    const fullUrl = mockShareService.getShareUrl(link.short_code, link.share_type);
    await navigator.clipboard.writeText(fullUrl);
    setCopiedId(link.id);
    setTimeout(() => setCopiedId(null), 2000);
    
    toast({
      title: "Link copied",
      description: "Share link has been copied to clipboard",
    });
  };

  const handleRevokeLink = async (shareId: string) => {
    setIsLoading(true);
    try {
      let response = await shareService.revokeShareLink(shareId);
      
      if (!response.success && response.error?.includes('401')) {
        response = await mockShareService.revokeShareLink(shareId);
      }
      
      if (response.success) {
        toast({
          title: "Link revoked",
          description: "The share link has been revoked",
        });
        await loadShareData();
      } else {
        toast({
          title: "Error",
          description: response.error || "Failed to revoke link",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to revoke share link",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditLink = (link: ShareLinkExtended) => {
    setEditingLinkId(link.id);
    setEditingLink({ ...link });
  };

  const handleSaveEditedLink = async () => {
    if (!editingLink || !editingLinkId) return;

    // TODO: Call backend API to update link settings including name
    toast({
      title: "Link updated",
      description: "Share link settings have been updated",
    });
    
    setEditingLinkId(null);
    setEditingLink(null);
    await loadShareData();
  };

  const handleShowQRCode = async (link: ShareLink) => {
    setIsGeneratingQR(true);
    setSelectedQRLink(link);
    
    try {
      const fullUrl = mockShareService.getShareUrl(link.short_code, link.share_type);
      // Generate QR code as data URL
      const qrDataUrl = await QRCode.toDataURL(fullUrl, {
        width: 400,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      
      setQrCodeUrl(qrDataUrl);
      setShowQRCode(true);
    } catch (error) {
      toast({
        title: "Error generating QR code",
        description: "Failed to generate QR code for this link",
        variant: "destructive"
      });
    } finally {
      setIsGeneratingQR(false);
    }
  };

  const handleDownloadQRCode = () => {
    if (!qrCodeUrl || !selectedQRLink) return;
    
    // Create a temporary link element
    const link = document.createElement('a');
    link.href = qrCodeUrl;
    link.download = `${deckName.replace(/\s+/g, '-')}-${selectedQRLink.share_type}-qr.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: "QR code downloaded",
      description: "The QR code has been saved to your downloads",
    });
  };

  const loadViewers = async (shareId: string) => {
    setIsLoadingViewers(true);
    try {
      const response = await shareService.getShareViewers(shareId);
      if (response.success && response.data) {
        setViewers(response.data.viewers);
      }
    } catch (error) {
      console.error('[DeckSharing] Error loading viewers:', error);
    } finally {
      setIsLoadingViewers(false);
    }
  };

  const loadAnalytics = async (link: ShareLink) => {
    setIsLoadingAnalytics(true);
    setSelectedLinkForAnalytics(link);

    // Also load viewers if the link has require_email
    loadViewers(link.id);

    try {
      // Try to get real analytics from backend
      const response = await shareService.getShareAnalytics(link.id);

      if (response.success && response.data) {
        setAnalyticsData(response.data);
      } else {
        // Fall back to basic data from link
        const viewCount = link.access_count || 0;
        const basicAnalytics: ShareAnalytics = {
          totalViews: viewCount,
          uniqueVisitors: viewCount,
          averageTimeSpent: 0,
          viewsByDate: [],
          viewsByHour: [],
          deviceTypes: {
            desktop: viewCount,
            mobile: 0,
            tablet: 0
          },
          topLocations: [],
          slideEngagement: [],
          referrers: [],
          recentViews: link.last_accessed_at && viewCount > 0 ? [{
            timestamp: link.last_accessed_at,
            location: '-',
            device: '-',
            duration: 0,
            slidesViewed: 0
          }] : []
        };
        setAnalyticsData(basicAnalytics);
      }
    } catch (error) {
      console.error('[DeckSharing] Error loading analytics:', error);
      // Use basic fallback
      const viewCount = link.access_count || 0;
      setAnalyticsData({
        totalViews: viewCount,
        uniqueVisitors: viewCount,
        averageTimeSpent: 0,
        viewsByDate: [],
        viewsByHour: [],
        deviceTypes: { desktop: viewCount, mobile: 0, tablet: 0 },
        topLocations: [],
        slideEngagement: [],
        referrers: [],
        recentViews: []
      });
    } finally {
      setIsLoadingAnalytics(false);
    }
  };

  // Check community submission status
  const checkCommunityStatus = async () => {
    setIsCheckingStatus(true);
    try {
      const submissions = await communityService.getMySubmissions();
      const existing = submissions.find(s => s.deckUuid === deckUuid);
      if (existing) {
        setSubmissionStatus(existing.status);
        setCommunityTitle(existing.title);
        setCommunityDescription(existing.description || '');
        setCommunityCategory(existing.category);
        setCommunityTags(existing.tags.join(', '));
      } else {
        setSubmissionStatus(null);
      }
    } catch (error) {
      console.error('[DeckSharing] Error checking community status:', error);
    } finally {
      setIsCheckingStatus(false);
    }
  };

  // Submit to community
  const handleSubmitToCommunity = async () => {
    if (!communityTitle.trim()) {
      toast({
        title: 'Title required',
        description: 'Please enter a title for your community submission',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await communityService.submitDeck({
        deckUuid,
        title: communityTitle.trim(),
        description: communityDescription.trim() || undefined,
        category: communityCategory as any,
        tags: communityTags.split(',').map(t => t.trim()).filter(Boolean),
      });

      toast({
        title: 'Submitted!',
        description: 'Your deck has been submitted for community review',
      });

      setSubmissionStatus('pending');
    } catch (error: any) {
      toast({
        title: 'Submission failed',
        description: error.message || 'Failed to submit deck',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Withdraw submission
  const handleWithdrawSubmission = async () => {
    try {
      const submissions = await communityService.getMySubmissions();
      const existing = submissions.find(s => s.deckUuid === deckUuid);
      if (existing) {
        await communityService.withdrawSubmission(existing.id);
        toast({
          title: 'Withdrawn',
          description: 'Your community submission has been withdrawn',
        });
        setSubmissionStatus(null);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to withdraw submission',
        variant: 'destructive',
      });
    }
  };

  const formatExpiration = (expiresAt: string | null) => {
    if (!expiresAt) return 'Never expires';
    const expiryDate = new Date(expiresAt);
    if (expiryDate < new Date()) return 'Expired';
    return `Expires ${formatDistanceToNow(expiryDate, { addSuffix: true })}`;
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <>
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="secondary"
          size="xs"
          className="h-7 px-3"
          data-tour="share-button"
        >
          <Share2 size={14} className="mr-1" />
          <span>Share</span>
        </Button>
      </DialogTrigger>
      <DialogContent
          className="p-0 border-0 bg-transparent shadow-2xl w-full max-w-[95vw] sm:max-w-[480px]"
        >
        <div className="bg-white rounded-2xl overflow-hidden border border-zinc-200 shadow-xl w-full">
          <div className="h-[3px] bg-gradient-to-r from-[#FF6B00] via-[#FF8533] to-[#FF6B00]" />
          <DialogHeader className="px-3 sm:px-6 pt-5 pb-4 border-b border-zinc-100">
            <DialogTitle
              className="text-lg text-zinc-900"
              style={{
                fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                fontWeight: 700,
                letterSpacing: '-0.01em'
              }}
            >
              Share Presentation
            </DialogTitle>
            <p className="text-sm text-zinc-500 mt-1">{deckName}</p>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
            <div className="px-3 sm:px-6 pt-4">
              <TabsList className="grid w-full grid-cols-4 h-8 p-0.5 bg-zinc-100 rounded-lg gap-0.5">
                <TabsTrigger
                  value="links"
                  className="rounded-md text-[11px] font-medium px-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF6B00] data-[state=active]:to-[#FF8533] data-[state=active]:text-white data-[state=active]:shadow-sm text-zinc-600 hover:text-zinc-900"
                >
                  Links
                </TabsTrigger>
                <TabsTrigger
                  value="collaborators"
                  className="rounded-md text-[11px] font-medium px-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF6B00] data-[state=active]:to-[#FF8533] data-[state=active]:text-white data-[state=active]:shadow-sm text-zinc-600 hover:text-zinc-900"
                >
                  Team
                </TabsTrigger>
                <TabsTrigger
                  value="analytics"
                  className="rounded-md text-[11px] font-medium px-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF6B00] data-[state=active]:to-[#FF8533] data-[state=active]:text-white data-[state=active]:shadow-sm text-zinc-600 hover:text-zinc-900"
                >
                  Stats
                </TabsTrigger>
                <TabsTrigger
                  value="community"
                  className="rounded-md text-[11px] font-medium px-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF6B00] data-[state=active]:to-[#FF8533] data-[state=active]:text-white data-[state=active]:shadow-sm text-zinc-600 hover:text-zinc-900"
                >
                  Community
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="px-3 sm:px-6 pb-6 overflow-y-auto" style={{ maxHeight: '60vh', minHeight: '300px' }}>
              <TabsContent value="links" className="space-y-3 mt-4 h-full">
                {/* Create new share link card */}
                <div className="p-4 rounded-xl bg-zinc-50 border border-dashed border-[#FF6B00]/30 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="share-type" className="text-xs font-medium mb-1.5 block text-zinc-600">Access</Label>
                      <Select value={shareType} onValueChange={(v) => setShareType(v as 'view' | 'edit')}>
                        <SelectTrigger id="share-type" className="h-8 text-xs bg-white border-zinc-200 text-zinc-900">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="view">
                            <div className="flex items-center">
                              <Eye size={12} className="mr-1.5 text-zinc-400" />
                              <span className="text-xs">View Only</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="edit">
                            <div className="flex items-center">
                              <Edit size={12} className="mr-1.5 text-zinc-400" />
                              <span className="text-xs">Can Edit</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="expiration" className="text-xs font-medium mb-1.5 block text-zinc-600">Expires</Label>
                      <Select value={expiresIn} onValueChange={setExpiresIn}>
                        <SelectTrigger id="expiration" className="h-8 text-xs bg-white border-zinc-200 text-zinc-900">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="never">Never</SelectItem>
                          <SelectItem value="24">24 hours</SelectItem>
                          <SelectItem value="168">7 days</SelectItem>
                          <SelectItem value="720">30 days</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Require Email Toggle */}
                  <div className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2">
                      <Mail size={12} className="text-zinc-400" />
                      <span className="text-xs text-zinc-600">Collect viewer emails</span>
                    </div>
                    <Switch
                      checked={requireEmail}
                      onCheckedChange={setRequireEmail}
                      className="scale-75 data-[state=checked]:bg-[#FF6B00]"
                    />
                  </div>

                  <Button
                    onClick={handleCreateShareLink}
                    disabled={isLoading}
                    className="w-full h-9 bg-gradient-to-r from-[#FF6B00] to-[#FF8533] hover:from-[#E65D00] hover:to-[#E67420] text-white text-sm font-semibold shadow-lg shadow-orange-500/20"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 size={14} className="mr-1.5 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Link size={14} className="mr-1.5" />
                        Create Link
                      </>
                    )}
                  </Button>
                </div>

              {/* Existing share links */}
              {shareLinks.length === 0 ? (
                <div className="text-center py-6 text-zinc-400">
                  <Link size={24} className="mx-auto mb-2 opacity-30" />
                  <p className="text-xs">No links yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {shareLinks.map((link) => (
                    <div
                      key={link.id}
                      className={cn(
                        "p-3 rounded-lg transition-all border",
                        editingLinkId === link.id ? "border-[#FF6B00]/40 bg-orange-50" : "bg-white border-zinc-200 hover:border-zinc-300"
                      )}
                    >
                      {editingLinkId === link.id && editingLink ? (
                        // Edit mode
                        <div className="space-y-2">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium text-sm text-zinc-900">Edit Link</h4>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
                                onClick={() => {
                                  setEditingLinkId(null);
                                  setEditingLink(null);
                                }}
                              >
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                className="h-7 px-2 text-xs bg-gradient-to-r from-[#FF6B00] to-[#FF8533] hover:from-[#E65D00] hover:to-[#E67420] text-white"
                                onClick={handleSaveEditedLink}
                                disabled={isLoading}
                              >
                                Save
                              </Button>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div>
                              <Label className="text-xs text-zinc-500">Name</Label>
                              <Input
                                type="text"
                                placeholder="e.g., Client Review v2"
                                value={editingLink.name || ''}
                                onChange={(e) => setEditingLink({
                                  ...editingLink,
                                  name: e.target.value
                                })}
                                className="h-7 text-xs bg-white border-zinc-200 text-zinc-900"
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        // View mode
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <div className="flex items-center text-zinc-500">
                                {link.share_type === 'view' ? (
                                  <Eye size={12} />
                                ) : (
                                  <Edit size={12} />
                                )}
                                <span className="font-medium text-xs ml-1 text-zinc-900">
                                  {link.share_type === 'view' ? 'View only' : 'Can edit'}
                                </span>
                              </div>

                              {link.password && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#FF6B00]/10 text-[#FF6B00]">
                                  <Lock size={8} className="inline mr-0.5" />
                                  Protected
                                </span>
                              )}

                              {(link.metadata?.require_email || link.require_email) && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600">
                                  <Mail size={8} className="inline mr-0.5" />
                                  Email
                                </span>
                              )}
                            </div>

                            <div className="text-[10px] text-zinc-400">
                              <span>{formatExpiration(link.expires_at)}</span>
                              {link.access_count !== undefined && (
                                <span> · {link.access_count} views</span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 ml-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100"
                              onClick={() => handleCopyLink(link)}
                            >
                              {copiedId === link.id ? (
                                <Check size={12} className="text-green-500" />
                              ) : (
                                <Copy size={12} />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100"
                              onClick={() => handleShowQRCode(link)}
                              disabled={isGeneratingQR}
                            >
                              {isGeneratingQR && selectedQRLink?.id === link.id ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <QrCode size={12} />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-zinc-400 hover:text-red-500 hover:bg-red-50"
                              onClick={() => handleRevokeLink(link.id)}
                            >
                              <Trash2 size={12} />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="collaborators" className="space-y-3 mt-4 h-full">
              {/* Add collaborator card */}
              <div className="p-4 rounded-xl bg-zinc-50 border border-dashed border-[#FF6B00]/30">
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Mail size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <Input
                      type="email"
                      placeholder="email@example.com"
                      value={collaboratorEmail}
                      onChange={(e) => setCollaboratorEmail(e.target.value)}
                      className="pl-8 h-8 text-xs bg-white border-zinc-200 text-zinc-900 placeholder:text-zinc-400"
                      ref={inviteInputRef}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && collaboratorEmail) {
                          handleAddCollaborator();
                        }
                      }}
                    />
                  </div>
                  <Button
                    onClick={handleAddCollaborator}
                    disabled={isLoading || !collaboratorEmail || !isAdmin}
                    className="h-8 px-3 bg-gradient-to-r from-[#FF6B00] to-[#FF8533] hover:from-[#E65D00] hover:to-[#E67420] text-xs font-semibold text-white"
                  >
                    {isLoading ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <>
                        <UserPlus size={12} className="mr-1" />
                        Invite
                      </>
                    )}
                  </Button>
                </div>

                {!isAdmin && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-zinc-400">
                    <AlertCircle size={12} />
                    <span>Only admins can invite team members</span>
                  </div>
                )}

                {invitedEmails.has(collaboratorEmail) && collaboratorEmail && (
                  <div className="flex items-center gap-1.5 mt-2 text-amber-600 text-xs">
                    <AlertCircle size={12} />
                    <span>Already invited</span>
                  </div>
                )}
              </div>

              {/* Team members */}
              {collaborators.length === 0 ? (
                <div className="text-center py-6 text-zinc-400">
                  <Users size={24} className="mx-auto mb-2 opacity-30" />
                  <p className="text-xs">No team members</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {collaborators.map((collaborator) => (
                    <div
                      key={collaborator.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-white border border-zinc-200 hover:border-zinc-300 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-[#FF6B00]/10 flex items-center justify-center text-[10px] font-semibold text-[#FF6B00]">
                          {collaborator.email.substring(0, 2).toUpperCase()}
                        </div>

                        <div>
                          <div className="font-medium text-sm text-zinc-900">{collaborator.email}</div>
                          <div className="text-[10px] text-zinc-400">
                            Added {formatDistanceToNow(new Date(collaborator.addedAt), { addSuffix: true })}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-[10px] px-2 py-0.5 rounded",
                          collaborator.status === 'active'
                            ? "bg-green-100 text-green-600"
                            : "bg-zinc-100 text-zinc-500"
                        )}>
                          {collaborator.status === 'active' ? 'Active' : 'Invited'}
                        </span>

                        {collaborator.status === 'invited' && collaborator.shareLink && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100"
                            onClick={() => {
                              const fullUrl = `${window.location.origin}${collaborator.shareLink}`;
                              navigator.clipboard.writeText(fullUrl);
                              toast({
                                title: "Link copied",
                                description: "Share link copied",
                              });
                            }}
                            title="Copy invite link"
                          >
                            <ExternalLink size={12} />
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-zinc-400 hover:text-red-500 hover:bg-red-50"
                          onClick={() => handleRemoveCollaborator(collaborator.id)}
                          disabled={!isAdmin}
                          title="Remove"
                        >
                          <X size={12} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="analytics" className="space-y-2 mt-4 h-full">
              {isLoadingAnalytics ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={24} className="animate-spin text-[#FF6B00]" />
                </div>
              ) : selectedLinkForAnalytics && analyticsData ? (
                <>
                  {/* Back button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedLinkForAnalytics(null);
                      setAnalyticsData(null);
                      setViewers([]);
                    }}
                    className="h-7 text-xs px-2 mb-1"
                  >
                    <ChevronLeft size={12} className="mr-1" />
                    Back
                  </Button>

                  {/* Condensed Stats Row */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2 rounded-lg bg-zinc-50 border border-zinc-200 text-center">
                      <p className="text-lg font-bold text-zinc-900">{analyticsData.totalViews}</p>
                      <p className="text-[10px] text-zinc-500">Views</p>
                    </div>
                    <div className="p-2 rounded-lg bg-zinc-50 border border-zinc-200 text-center">
                      <p className="text-lg font-bold text-zinc-900">{analyticsData.uniqueVisitors}</p>
                      <p className="text-[10px] text-zinc-500">Visitors</p>
                    </div>
                    <div className="p-2 rounded-lg bg-zinc-50 border border-zinc-200 text-center">
                      <p className="text-lg font-bold text-zinc-900">
                        {analyticsData.averageTimeSpent > 0 ? formatDuration(analyticsData.averageTimeSpent) : '-'}
                      </p>
                      <p className="text-[10px] text-zinc-500">Avg Time</p>
                    </div>
                  </div>

                  {/* Collected Emails Section */}
                  {(selectedLinkForAnalytics.metadata?.require_email || (selectedLinkForAnalytics as ShareLinkExtended).require_email) && (
                    <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <Mail size={12} className="text-blue-600" />
                          <span className="text-xs font-medium text-blue-900">Collected Emails</span>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-600 text-white font-medium">
                          {viewers.length}
                        </span>
                      </div>
                      {isLoadingViewers ? (
                        <div className="flex justify-center py-2">
                          <Loader2 size={14} className="animate-spin text-blue-600" />
                        </div>
                      ) : viewers.length === 0 ? (
                        <p className="text-[10px] text-blue-600/70">No emails collected yet</p>
                      ) : (
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {viewers.slice(0, 10).map((viewer) => (
                            <div key={viewer.id} className="flex items-center justify-between text-[10px]">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <div className="w-5 h-5 rounded bg-blue-600/20 flex items-center justify-center text-[8px] font-medium text-blue-700 shrink-0">
                                  {viewer.email.substring(0, 2).toUpperCase()}
                                </div>
                                <span className="text-blue-900 truncate">{viewer.email}</span>
                              </div>
                              <span className="text-blue-600/60 shrink-0 ml-2">
                                {formatDistanceToNow(new Date(viewer.registered_at), { addSuffix: true })}
                              </span>
                            </div>
                          ))}
                          {viewers.length > 10 && (
                            <p className="text-[10px] text-blue-600/70 text-center pt-1">
                              +{viewers.length - 10} more
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Condensed Device Stats */}
                  <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Monitor size={12} className="text-zinc-500" />
                      <span className="text-xs font-medium text-zinc-700">Devices</span>
                    </div>
                    <div className="flex gap-3 text-[10px]">
                      <span className="text-zinc-600">Desktop <span className="font-medium text-zinc-900">{analyticsData.deviceTypes?.desktop ?? 0}</span></span>
                      <span className="text-zinc-600">Mobile <span className="font-medium text-zinc-900">{analyticsData.deviceTypes?.mobile ?? 0}</span></span>
                      <span className="text-zinc-600">Tablet <span className="font-medium text-zinc-900">{analyticsData.deviceTypes?.tablet ?? 0}</span></span>
                    </div>
                  </div>

                  {/* Slide Engagement - Condensed */}
                  {(analyticsData.slideEngagement || []).length > 0 && (
                    <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200">
                      <div className="flex items-center gap-1.5 mb-2">
                        <FileText size={12} className="text-zinc-500" />
                        <span className="text-xs font-medium text-zinc-700">Slide Time</span>
                      </div>
                      <div className="space-y-1.5">
                        {(analyticsData.slideEngagement || []).slice(0, 5).map((slide) => (
                          <div key={slide.slideNumber} className="flex items-center gap-2 text-[10px]">
                            <span className="text-zinc-500 w-8">#{slide.slideNumber}</span>
                            <div className="flex-1 bg-zinc-200 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="h-full bg-[#FF6B00]"
                                style={{
                                  width: `${Math.min(100, (slide.avgTime / Math.max(1, ...analyticsData.slideEngagement!.map(s => s.avgTime))) * 100)}%`
                                }}
                              />
                            </div>
                            <span className="text-zinc-600 font-medium w-8 text-right">{slide.avgTime}s</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recent Activity - Condensed */}
                  {(analyticsData.recentViews || []).length > 0 && (
                    <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Activity size={12} className="text-zinc-500" />
                        <span className="text-xs font-medium text-zinc-700">Recent</span>
                      </div>
                      <div className="space-y-1">
                        {(analyticsData.recentViews || []).slice(0, 3).map((view, idx) => (
                          <div key={idx} className="flex items-center justify-between text-[10px]">
                            <div className="flex items-center gap-1">
                              <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                              <span className="text-zinc-500">
                                {formatDistanceToNow(new Date(view.timestamp), { addSuffix: true })}
                              </span>
                            </div>
                            <span className="text-zinc-400">
                              {view.duration > 0 ? `${formatDuration(view.duration)}` : '-'}
                              {view.slidesViewed > 0 && ` · ${view.slidesViewed} slides`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                // Link selection for analytics
                <div className="space-y-2">
                  {shareLinks.length === 0 ? (
                    <div className="p-6 rounded-xl bg-zinc-50 border border-zinc-200 text-center">
                      <BarChart3 size={24} className="mx-auto mb-2 text-zinc-300" />
                      <p className="text-xs text-zinc-500">Create a share link to track stats</p>
                    </div>
                  ) : (
                    shareLinks.map((link) => (
                      <div
                        key={link.id}
                        className="p-3 rounded-lg bg-white border border-zinc-200 cursor-pointer hover:border-[#FF6B00]/50 transition-colors"
                        onClick={() => loadAnalytics(link)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="text-zinc-400">
                              {link.share_type === 'view' ? <Eye size={12} /> : <Edit size={12} />}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-medium text-zinc-900">
                                  {link.share_type === 'view' ? 'View' : 'Edit'}
                                </span>
                                {(link.metadata?.require_email || link.require_email) && (
                                  <span className="text-[8px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-600">
                                    <Mail size={6} className="inline mr-0.5" />
                                    Email
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-zinc-400">{link.access_count || 0} views</p>
                            </div>
                          </div>
                          <ChevronRight size={14} className="text-zinc-300" />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="community" className="space-y-3 mt-4 h-full">
              {isCheckingStatus ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={24} className="animate-spin text-[#FF6B00]" />
                </div>
              ) : submissionStatus ? (
                // Show submission status
                <div className="space-y-4">
                  <div className={cn(
                    "p-4 rounded-xl border",
                    submissionStatus === 'approved' && "bg-green-50 border-green-200",
                    submissionStatus === 'pending' && "bg-amber-50 border-amber-200",
                    submissionStatus === 'rejected' && "bg-red-50 border-red-200"
                  )}>
                    <div className="flex items-center gap-2 mb-2">
                      {submissionStatus === 'approved' && (
                        <>
                          <Check size={16} className="text-green-600" />
                          <span className="font-medium text-green-900">Published to Community</span>
                        </>
                      )}
                      {submissionStatus === 'pending' && (
                        <>
                          <Clock size={16} className="text-amber-600" />
                          <span className="font-medium text-amber-900">Under Review</span>
                        </>
                      )}
                      {submissionStatus === 'rejected' && (
                        <>
                          <X size={16} className="text-red-600" />
                          <span className="font-medium text-red-900">Not Approved</span>
                        </>
                      )}
                    </div>
                    <p className="text-xs text-zinc-600">
                      {submissionStatus === 'approved' && "Your deck is now visible in the community gallery."}
                      {submissionStatus === 'pending' && "Thanks for sharing! We'll have this up shortly."}
                      {submissionStatus === 'rejected' && "Your submission was not approved. You can make changes and resubmit."}
                    </p>
                  </div>

                  {/* Show current submission details */}
                  <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200">
                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="text-zinc-500">Title:</span>
                        <span className="ml-2 text-zinc-900">{communityTitle}</span>
                      </div>
                      {communityDescription && (
                        <div>
                          <span className="text-zinc-500">Description:</span>
                          <span className="ml-2 text-zinc-900">{communityDescription}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-zinc-500">Category:</span>
                        <Badge
                          variant="outline"
                          className="ml-2 text-[10px]"
                          style={{
                            borderColor: COMMUNITY_CATEGORIES[communityCategory as keyof typeof COMMUNITY_CATEGORIES]?.color,
                            color: COMMUNITY_CATEGORIES[communityCategory as keyof typeof COMMUNITY_CATEGORIES]?.color,
                          }}
                        >
                          {COMMUNITY_CATEGORIES[communityCategory as keyof typeof COMMUNITY_CATEGORIES]?.name || communityCategory}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Withdraw button for pending submissions */}
                  {submissionStatus === 'pending' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs text-red-600 border-red-200 hover:bg-red-50"
                      onClick={handleWithdrawSubmission}
                    >
                      <X size={12} className="mr-1.5" />
                      Withdraw Submission
                    </Button>
                  )}

                  {/* Resubmit button for rejected */}
                  {submissionStatus === 'rejected' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs"
                      onClick={() => setSubmissionStatus(null)}
                    >
                      <Edit size={12} className="mr-1.5" />
                      Edit & Resubmit
                    </Button>
                  )}
                </div>
              ) : (
                // Submission form
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-zinc-50 border border-dashed border-[#FF6B00]/30 space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Globe size={14} className="text-[#FF6B00]" />
                      <span className="text-xs font-medium text-zinc-700">Share with the Community</span>
                    </div>

                    <p className="text-[10px] text-zinc-500 -mt-1">
                      Submit your deck to be featured in the NextSlide community gallery. Once approved, others can browse and remix your slides.
                    </p>

                    {/* Title */}
                    <div>
                      <Label htmlFor="community-title" className="text-xs font-medium mb-1.5 block text-zinc-600">
                        Title *
                      </Label>
                      <Input
                        id="community-title"
                        placeholder="Enter a catchy title..."
                        value={communityTitle}
                        onChange={(e) => setCommunityTitle(e.target.value)}
                        className="h-8 text-xs bg-white border-zinc-200 text-zinc-900"
                      />
                    </div>

                    {/* Description */}
                    <div>
                      <Label htmlFor="community-desc" className="text-xs font-medium mb-1.5 block text-zinc-600">
                        Description
                      </Label>
                      <Textarea
                        id="community-desc"
                        placeholder="What's this deck about? (optional)"
                        value={communityDescription}
                        onChange={(e) => setCommunityDescription(e.target.value)}
                        className="text-xs bg-white border-zinc-200 text-zinc-900 min-h-[60px] resize-none"
                      />
                    </div>

                    {/* Category */}
                    <div>
                      <Label className="text-xs font-medium mb-1.5 block text-zinc-600">
                        Category *
                      </Label>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(COMMUNITY_CATEGORIES).map(([key, cat]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setCommunityCategory(key)}
                            className={cn(
                              "flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-left transition-all",
                              communityCategory === key
                                ? `bg-gradient-to-r ${cat.gradient} text-white shadow-sm`
                                : "bg-white border border-zinc-200 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
                            )}
                          >
                            <span
                              className={cn(
                                "w-2 h-2 rounded-full shrink-0",
                                communityCategory === key && "bg-white/80"
                              )}
                              style={{ backgroundColor: communityCategory === key ? undefined : cat.color }}
                            />
                            {cat.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Tags */}
                    <div>
                      <Label htmlFor="community-tags" className="text-xs font-medium mb-1.5 block text-zinc-600">
                        Tags
                      </Label>
                      <Input
                        id="community-tags"
                        placeholder="startup, pitch, saas (comma separated)"
                        value={communityTags}
                        onChange={(e) => setCommunityTags(e.target.value)}
                        className="h-8 text-xs bg-white border-zinc-200 text-zinc-900"
                      />
                    </div>

                    <Button
                      onClick={handleSubmitToCommunity}
                      disabled={isSubmitting || !communityTitle.trim()}
                      className="w-full h-9 bg-gradient-to-r from-[#FF6B00] to-[#FF8533] hover:from-[#E65D00] hover:to-[#E67420] text-white text-sm font-semibold shadow-lg shadow-orange-500/20"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 size={14} className="mr-1.5 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        <>
                          <Globe size={14} className="mr-1.5" />
                          Submit for Review
                        </>
                      )}
                    </Button>
                  </div>

                  <p className="text-[10px] text-zinc-400 text-center">
                    Submissions are reviewed shortly
                  </p>
                </div>
              )}
            </TabsContent>
            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>

    {/* QR Code Modal */}
    <Dialog open={showQRCode} onOpenChange={setShowQRCode}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone size={20} />
            QR Code for Mobile Sharing
          </DialogTitle>
          <DialogDescription>
            Scan this QR code with a mobile device to access the {selectedQRLink?.share_type === 'view' ? 'presentation' : 'deck'}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col items-center space-y-4 py-4">
          {qrCodeUrl && (
            <>
              <div className="bg-white p-4 rounded-lg shadow-lg">
                <img 
                  src={qrCodeUrl} 
                  alt="QR Code" 
                  className="w-64 h-64"
                />
              </div>
              
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  {selectedQRLink?.share_type === 'view' ? 'View-only' : 'Edit'} access
                </p>
                {selectedQRLink?.expires_at && (
                  <p className="text-xs text-muted-foreground">
                    {formatExpiration(selectedQRLink.expires_at)}
                  </p>
                )}
              </div>
              
              <div className="flex gap-2 w-full">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    const fullUrl = selectedQRLink ? 
                      mockShareService.getShareUrl(selectedQRLink.short_code, selectedQRLink.share_type) : '';
                    navigator.clipboard.writeText(fullUrl);
                    toast({
                      title: "Link copied",
                      description: "Share link copied to clipboard",
                    });
                  }}
                >
                  <Copy size={14} className="mr-2" />
                  Copy Link
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleDownloadQRCode}
                >
                  <Download size={14} className="mr-2" />
                  Download QR
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
};

export default DeckSharing; 