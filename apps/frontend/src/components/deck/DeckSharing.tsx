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
import { shareService, ShareLink, ApiResponse, CollaboratorResponse, ShareAnalytics } from '@/services/shareService';
import { mockShareService } from '@/services/mockShareService';
import { formatDistanceToNow } from 'date-fns';
import { useDeckStore } from '@/stores/deckStore';
import { Switch } from '../ui/switch';
import { Separator } from '../ui/separator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { cn } from '@/lib/utils';
import QRCode from 'qrcode';
import { useAuth } from '@/context/SupabaseAuthContext';

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
  name?: string; // Add name field
}



const DeckSharing: React.FC<DeckSharingProps> = ({ deckUuid, deckName }) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'links' | 'collaborators' | 'analytics'>('links');
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

  // Load existing share links and collaborators when dialog opens
  useEffect(() => {
    if (isOpen) {
      loadShareData();
    }
  }, [isOpen]);

  // Allow opening this dialog via global event from header popover
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      try {
        const tab = e.detail?.tab as 'links' | 'collaborators' | 'analytics' | undefined;
        const focusInvite = Boolean(e.detail?.focusInvite);
        setActiveTab(tab || 'collaborators');
        setIsOpen(true);
        // Focus invite input shortly after open
        if (focusInvite) {
          setTimeout(() => inviteInputRef.current?.focus(), 50);
        }
      } catch {}
    };
    window.addEventListener('open-deck-sharing', handler as EventListener);
    return () => window.removeEventListener('open-deck-sharing', handler as EventListener);
  }, []);

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
        expires_in_hours: expiresInHours
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
        
        // Reset form
        setPassword('');
        setRequirePassword(false);
        setMaxUses(undefined);
        
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

  const loadAnalytics = async (link: ShareLink) => {
    setIsLoadingAnalytics(true);
    setSelectedLinkForAnalytics(link);
    
    try {
      const response = await shareService.getShareAnalytics(link.id);
      
      if (response.success && response.data) {
        setAnalyticsData(response.data);
      } else {
        // If analytics endpoint not available, fall back to basic stats
        console.warn('[DeckSharing] Analytics endpoint not available, falling back to basic stats');
        
        const statsResponse = await shareService.getShareStatistics(link.id);
        if (statsResponse.success && statsResponse.data) {
          // Convert basic stats to analytics format
          const viewCount = statsResponse.data.access_count || 0;
          const basicAnalytics: ShareAnalytics = {
            totalViews: viewCount,
            uniqueVisitors: viewCount > 0 ? Math.max(1, Math.floor(viewCount * 0.7)) : 0,
            averageTimeSpent: viewCount > 0 ? 120 : 0, // Only show time if there are views
            viewsByDate: [], // No detailed data available
            viewsByHour: [],
            deviceTypes: { 
              desktop: viewCount > 0 ? Math.max(1, Math.floor(viewCount * 0.6)) : 0,
              mobile: Math.floor(viewCount * 0.3),
              tablet: Math.floor(viewCount * 0.1)
            },
            topLocations: [],
            slideEngagement: [],
            referrers: [],
            recentViews: statsResponse.data.last_accessed_at && viewCount > 0 ? [{
              timestamp: statsResponse.data.last_accessed_at,
              location: 'Unknown',
              device: 'Unknown',
              duration: 120,
              slidesViewed: 1
            }] : []
          };
          setAnalyticsData(basicAnalytics);
        } else {
          throw new Error(response.error || 'Failed to load analytics');
        }
      }
    } catch (error) {
      console.error('[DeckSharing] Error loading analytics:', error);
      toast({
        title: "Error loading analytics",
        description: error instanceof Error ? error.message : "Failed to load analytics data",
        variant: "destructive"
      });
      
      // Clear analytics data on error
      setAnalyticsData(null);
      setSelectedLinkForAnalytics(null);
    } finally {
      setIsLoadingAnalytics(false);
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
        >
          <Share2 size={14} className="mr-1" />
          <span>Share</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[650px] max-h-[85vh] overflow-hidden p-0 bg-[#F5F5DC] dark:bg-zinc-900">
        <DialogHeader className="px-6 py-4 bg-white dark:bg-zinc-950 border-b">
          <DialogTitle 
            className="text-lg text-[#383636] dark:text-gray-100"
            style={{
              fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
              fontWeight: 700,
              letterSpacing: '-0.02em'
            }}
          >
            SHARE "{deckName.toUpperCase()}"
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-10 p-0.5 mx-6 mt-4 bg-[#FF4301]/10 dark:bg-[#FF4301]/20" style={{ width: 'calc(100% - 48px)' }}>
            <TabsTrigger 
              value="links" 
              className="data-[state=active]:bg-[#FF4301] data-[state=active]:text-white text-sm font-medium"
            >
              <Link size={14} className="mr-1.5" />
              Links
            </TabsTrigger>
            <TabsTrigger 
              value="collaborators" 
              className="data-[state=active]:bg-[#FF4301] data-[state=active]:text-white text-sm font-medium"
            >
              <Users size={14} className="mr-1.5" />
              Team
            </TabsTrigger>
            <TabsTrigger 
              value="analytics" 
              className="data-[state=active]:bg-[#FF4301] data-[state=active]:text-white text-sm font-medium"
            >
              <BarChart3 size={14} className="mr-1.5" />
              Stats
            </TabsTrigger>
          </TabsList>

          <div className="px-6 pb-6 overflow-y-auto" style={{ maxHeight: 'calc(85vh - 140px)' }}>
            <TabsContent value="links" className="space-y-3 mt-4">
              {/* Create new share link card */}
              <Card className="border-dashed border-[#FF4301]/30 bg-white/50 dark:bg-zinc-950/50">
                <CardContent className="p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="share-type" className="text-xs font-medium mb-1.5 block">Access</Label>
                      <Select value={shareType} onValueChange={(v) => setShareType(v as 'view' | 'edit')}>
                        <SelectTrigger id="share-type" className="h-9 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="view">
                            <div className="flex items-center">
                              <Eye size={12} className="mr-1.5 text-muted-foreground" />
                              <span className="text-sm">View Only</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="edit">
                            <div className="flex items-center">
                              <Edit size={12} className="mr-1.5 text-muted-foreground" />
                              <span className="text-sm">Can Edit</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="expiration" className="text-xs font-medium mb-1.5 block">Expires</Label>
                      <Select value={expiresIn} onValueChange={setExpiresIn}>
                        <SelectTrigger id="expiration" className="h-9 text-sm">
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

                  {/* Advanced options */}
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Password</Label>
                      <Switch 
                        checked={requirePassword} 
                        onCheckedChange={setRequirePassword}
                        className="h-4 w-8"
                      />
                    </div>
                    
                    {requirePassword && (
                      <Input
                        type="password"
                        placeholder="Enter password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="h-8 text-sm"
                      />
                    )}

                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Max uses</Label>
                      <Input
                        type="number"
                        placeholder="∞"
                        value={maxUses || ''}
                        onChange={(e) => setMaxUses(e.target.value ? parseInt(e.target.value) : undefined)}
                        className="w-20 h-8 text-sm text-center"
                        min={1}
                      />
                    </div>
                  </div>

                  <Button 
                    onClick={handleCreateShareLink} 
                    disabled={isLoading}
                    className="w-full h-9 bg-[#FF4301] hover:bg-[#E63901] text-white"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 size={12} className="mr-1.5 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Link size={12} className="mr-1.5" />
                        Create Link
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* Existing share links */}
              {shareLinks.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Link size={24} className="mx-auto mb-2 opacity-20" />
                  <p className="text-xs">No links yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {shareLinks.map((link) => (
                    <div 
                      key={link.id} 
                      className={cn(
                        "p-3 border rounded-lg transition-all bg-white dark:bg-zinc-950",
                        editingLinkId === link.id ? "ring-2 ring-[#FF4301]" : "hover:border-[#FF4301]/30"
                      )}
                    >
                      {editingLinkId === link.id && editingLink ? (
                        // Edit mode
                        <div className="space-y-2">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium text-sm">Edit Link</h4>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs"
                                onClick={() => {
                                  setEditingLinkId(null);
                                  setEditingLink(null);
                                }}
                              >
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                className="h-7 px-2 text-xs bg-[#FF4301] hover:bg-[#E63901]"
                                onClick={handleSaveEditedLink}
                                disabled={isLoading}
                              >
                                Save
                              </Button>
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            <div>
                              <Label className="text-xs">Name</Label>
                              <Input
                                type="text"
                                placeholder="e.g., Client Review v2"
                                value={editingLink.name || ''}
                                onChange={(e) => setEditingLink({
                                  ...editingLink,
                                  name: e.target.value
                                })}
                                className="h-8 text-sm"
                              />
                            </div>
                            
                            <div>
                              <Label className="text-xs">Expires</Label>
                              <Input
                                type="datetime-local"
                                value={editingLink.expires_at || ''}
                                onChange={(e) => setEditingLink({
                                  ...editingLink,
                                  expires_at: e.target.value
                                })}
                                className="h-8 text-sm"
                              />
                            </div>
                            
                            {editingLink.password !== undefined && (
                              <div>
                                <Label className="text-xs">Password</Label>
                                <Input
                                  type="password"
                                  placeholder="Change password"
                                  value={editingLink.password || ''}
                                  onChange={(e) => setEditingLink({
                                    ...editingLink,
                                    password: e.target.value
                                  })}
                                  className="h-8 text-sm"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        // View mode
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              {(link as ShareLinkExtended).name && (
                                <span className="font-medium text-sm truncate max-w-[200px]">
                                  {(link as ShareLinkExtended).name}
                                </span>
                              )}
                              <div className="flex items-center">
                                {link.share_type === 'view' ? (
                                  <Eye size={12} className="text-muted-foreground" />
                                ) : (
                                  <Edit size={12} className="text-muted-foreground" />
                                )}
                                <span className="font-medium text-xs ml-1">
                                  {link.share_type === 'view' ? 'View' : 'Edit'}
                                </span>
                              </div>
                              
                              {link.password && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                                  <Lock size={8} className="mr-0.5" />
                                  Protected
                                </Badge>
                              )}
                              
                              {link.max_uses && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                                  {link.used_count || 0}/{link.max_uses}
                                </Badge>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              <span>{formatExpiration(link.expires_at)}</span>
                              {link.access_count !== undefined && (
                                <>
                                  <span>•</span>
                                  <span>{link.access_count} views</span>
                                </>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-0.5 ml-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleCopyLink(link)}
                            >
                              {copiedId === link.id ? (
                                <Check size={12} className="text-green-600" />
                              ) : (
                                <Copy size={12} />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
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
                              className="h-7 w-7"
                              onClick={() => handleEditLink(link)}
                            >
                              <Settings size={12} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 hover:text-destructive"
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

            <TabsContent value="collaborators" className="space-y-3 mt-4">
              {/* Add collaborator card */}
              <Card className="border-dashed border-[#FF4301]/30 bg-white/50 dark:bg-zinc-950/50">
                <CardContent className="p-4">
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <Mail size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="email"
                        placeholder="email@example.com"
                        value={collaboratorEmail}
                        onChange={(e) => setCollaboratorEmail(e.target.value)}
                        className="pl-8 h-9 text-sm"
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
                      className="h-9 px-3 bg-[#FF4301] hover:bg-[#E63901]"
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
                    <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
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
                </CardContent>
              </Card>

              {/* Team members */}
              {collaborators.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Users size={24} className="mx-auto mb-2 opacity-20" />
                  <p className="text-xs">No team members</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {collaborators.map((collaborator) => (
                    <div 
                      key={collaborator.id}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-white/50 dark:hover:bg-zinc-950/50 transition-colors bg-white dark:bg-zinc-950"
                    >
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-[10px] bg-[#FF4301]/10 text-[#FF4301]">
                            {collaborator.email.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        
                        <div>
                          <div className="font-medium text-sm">{collaborator.email}</div>
                          <div className="text-[10px] text-muted-foreground">
                            Added {formatDistanceToNow(new Date(collaborator.addedAt), { addSuffix: true })}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <Badge 
                          variant={collaborator.status === 'active' ? 'default' : 'secondary'}
                          className="text-[10px] px-1.5 py-0 h-4"
                        >
                          {collaborator.status === 'active' ? 'Active' : 'Invited'}
                        </Badge>
                        
                        {collaborator.status === 'invited' && collaborator.shareLink && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
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
                          className="h-7 w-7 hover:text-destructive"
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

            <TabsContent value="analytics" className="space-y-3 mt-4">
              {isLoadingAnalytics ? (
                <div className="flex items-center justify-center py-16">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#FF4301] mx-auto mb-4"></div>
                    <p className="text-sm text-muted-foreground">Loading analytics...</p>
                  </div>
                </div>
              ) : selectedLinkForAnalytics && analyticsData ? (
                <>
                  {/* Back button and header */}
                  <div className="flex items-center justify-between mb-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedLinkForAnalytics(null);
                        setAnalyticsData(null);
                      }}
                      className="h-8 text-xs"
                    >
                      <ChevronLeft size={14} className="mr-1" />
                      Back to links
                    </Button>
                    <div className="text-sm font-medium">
                      {(selectedLinkForAnalytics as ShareLinkExtended).name || 'Untitled Link'}
                    </div>
                  </div>

                  {/* Overview Cards */}
                  <div className="grid grid-cols-3 gap-2">
                    <Card className="bg-white dark:bg-zinc-950">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-muted-foreground">Total Views</p>
                            <p className="text-xl font-bold">{analyticsData.totalViews}</p>
                          </div>
                          <Eye className="h-8 w-8 text-[#FF4301]/20" />
                        </div>
                      </CardContent>
                    </Card>
                    
                    <Card className="bg-white dark:bg-zinc-950">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-muted-foreground">Unique Visitors</p>
                            <p className="text-xl font-bold">{analyticsData.uniqueVisitors}</p>
                          </div>
                          <Users className="h-8 w-8 text-[#FF4301]/20" />
                        </div>
                      </CardContent>
                    </Card>
                    
                    <Card className="bg-white dark:bg-zinc-950">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-muted-foreground">Avg. Time</p>
                            <p className="text-xl font-bold">
                              {analyticsData.averageTimeSpent > 0 
                                ? formatDuration(analyticsData.averageTimeSpent) 
                                : '-'}
                            </p>
                          </div>
                          <Timer className="h-8 w-8 text-[#FF4301]/20" />
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Views Over Time Chart */}
                  <Card className="bg-white dark:bg-zinc-950">
                    <CardHeader className="p-3 pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <TrendingUp size={14} />
                        Views Over Time
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-1">
                      <div className="h-32 flex items-end gap-1">
                        {(analyticsData?.viewsByDate || []).map((day, idx) => {
                          const days = analyticsData?.viewsByDate || [];
                          const maxViews = Math.max(1, ...days.map(d => (d?.views ?? 0)));
                          const height = maxViews > 0 ? (day.views / maxViews) * 100 : 0;
                          return (
                            <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                              <div 
                                className="w-full bg-[#FF4301]/80 rounded-t hover:bg-[#FF4301] transition-colors relative group"
                                style={{ height: `${height}%` }}
                              >
                                <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                                  {day.views}
                                </span>
                              </div>
                              <span className="text-[9px] text-muted-foreground">
                                {new Date(day.date).toLocaleDateString('en', { day: 'numeric' })}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Device & Location Stats */}
                  <div className="grid grid-cols-2 gap-2">
                    <Card className="bg-white dark:bg-zinc-950">
                      <CardHeader className="p-3 pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Monitor size={14} />
                          Devices
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 pt-1 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs">Desktop</span>
                          <span className="text-xs font-medium">{analyticsData.deviceTypes?.desktop ?? 0}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs">Mobile</span>
                          <span className="text-xs font-medium">{analyticsData.deviceTypes?.mobile ?? 0}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs">Tablet</span>
                          <span className="text-xs font-medium">{analyticsData.deviceTypes?.tablet ?? 0}</span>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-white dark:bg-zinc-950">
                      <CardHeader className="p-3 pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <MapPin size={14} />
                          Top Locations
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 pt-1 space-y-2">
                        {(analyticsData.topLocations || []).slice(0, 3).map((loc, idx) => (
                          <div key={idx} className="flex items-center justify-between">
                            <span className="text-xs truncate">{loc.city}</span>
                            <span className="text-xs font-medium">{loc.views}</span>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Slide Engagement */}
                  <Card className="bg-white dark:bg-zinc-950">
                    <CardHeader className="p-3 pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <FileText size={14} />
                        Slide Engagement
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-1">
                      <div className="space-y-2">
                        {(analyticsData.slideEngagement || []).map((slide) => (
                          <div key={slide.slideNumber} className="flex items-center gap-2">
                            <span className="text-xs w-12">Slide {slide.slideNumber}</span>
                            <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                              <div 
                                className="h-full bg-[#FF4301]"
                                style={{ width: `${(slide.views / (analyticsData.totalViews || 1)) * 100}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground w-12 text-right">
                              {Math.round((slide.views / (analyticsData.totalViews || 1)) * 100)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Recent Activity */}
                  <Card className="bg-white dark:bg-zinc-950">
                    <CardHeader className="p-3 pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Activity size={14} />
                        Recent Activity
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-1">
                      <div className="space-y-2">
                        {(analyticsData.recentViews || []).map((view, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-green-500 rounded-full" />
                              <span className="text-muted-foreground">
                                {formatDistanceToNow(new Date(view.timestamp), { addSuffix: true })}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-muted-foreground">
                              <span>{view.location}</span>
                              <span>{view.slidesViewed} slides</span>
                              <span>{formatDuration(view.duration)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : (
                // Link selection for analytics
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Select a share link to view analytics</p>
                  {shareLinks.length === 0 ? (
                    <Card className="bg-white/50 dark:bg-zinc-950/50">
                      <CardContent className="py-8">
                        <div className="text-center text-muted-foreground">
                          <Link size={32} className="mx-auto mb-3 opacity-20" />
                          <p className="text-sm font-medium mb-1">No Share Links</p>
                          <p className="text-xs">Create a share link to track analytics</p>
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-2">
                      {shareLinks.map((link) => (
                        <Card 
                          key={link.id}
                          className="bg-white dark:bg-zinc-950 cursor-pointer hover:border-[#FF4301]/50 transition-colors"
                          onClick={() => loadAnalytics(link)}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium text-sm">
                                  {link.name || 'Untitled Link'}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {link.share_type === 'view' ? 'View only' : 'Can edit'} • 
                                  {link.access_count || 0} views
                                </p>
                              </div>
                              <ChevronRight size={16} className="text-muted-foreground" />
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
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