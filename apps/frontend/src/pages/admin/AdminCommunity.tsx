import React, { useEffect, useState, useRef, useCallback } from 'react';
import AdminLayoutV2 from '@/components/admin/AdminLayoutV2';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  Search,
  Check,
  X,
  Eye,
  Users,
  FileStack,
  TrendingUp,
  Clock,
  Trash2,
  RefreshCw,
  Pencil,
  Loader2,
} from 'lucide-react';
import { Label } from '@/components/ui/label';
import { format, formatDistanceToNow } from 'date-fns';
import { adminApi, CommunitySubmission, CommunityStats } from '@/services/adminApi';
import { COMMUNITY_CATEGORIES } from '@/services/communityService';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import MiniSlide from '@/components/deck/MiniSlide';
import { useIsMobile } from '@/hooks/use-mobile';

type TabStatus = 'pending' | 'approved' | 'rejected';

const ITEMS_PER_PAGE = 12;

const AdminCommunity: React.FC = () => {
  const isMobile = useIsMobile();
  const [submissions, setSubmissions] = useState<CommunitySubmission[]>([]);
  const [stats, setStats] = useState<CommunityStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [activeTab, setActiveTab] = useState<TabStatus>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);

  // Sentinel ref for infinite scroll
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Dialog states
  const [previewSubmission, setPreviewSubmission] = useState<CommunitySubmission | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Edit dialog states
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingSubmission, setEditingSubmission] = useState<CommunitySubmission | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editTags, setEditTags] = useState('');

  // Fetch initial submissions when tab changes
  useEffect(() => {
    setSubmissions([]);
    setCurrentPage(1);
    setHasMore(true);
    fetchSubmissions(1, true);
    fetchStats();
  }, [activeTab]);

  const fetchSubmissions = async (page: number, isInitial: boolean = false) => {
    try {
      if (isInitial) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }
      const response = await adminApi.getCommunityQueue({
        status: activeTab,
        page: page,
        limit: ITEMS_PER_PAGE,
      });
      const newSubmissions = response.submissions || [];
      setTotal(response.total || 0);

      if (isInitial) {
        setSubmissions(newSubmissions);
      } else {
        setSubmissions(prev => [...prev, ...newSubmissions]);
      }

      // Check if there are more items to load
      const totalLoaded = isInitial ? newSubmissions.length : submissions.length + newSubmissions.length;
      setHasMore(totalLoaded < (response.total || 0));
    } catch (error) {
      console.error('Error fetching submissions:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load community submissions',
      });
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  // Load more when scrolling to bottom
  const loadMore = useCallback(() => {
    if (isLoadingMore || !hasMore) return;
    const nextPage = currentPage + 1;
    setCurrentPage(nextPage);
    fetchSubmissions(nextPage, false);
  }, [currentPage, isLoadingMore, hasMore, activeTab]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore && !isLoading) {
          loadMore();
        }
      },
      { rootMargin: '100px', threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, hasMore, isLoadingMore, isLoading]);

  const fetchStats = async () => {
    try {
      const response = await adminApi.getCommunityStats();
      setStats(response);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const refreshList = () => {
    setSubmissions([]);
    setCurrentPage(1);
    setHasMore(true);
    fetchSubmissions(1, true);
    fetchStats();
  };

  const handleApprove = async (submission: CommunitySubmission) => {
    try {
      setActionInProgress(submission.id);
      await adminApi.approveCommunitySubmission(submission.id);
      toast({
        title: 'Approved',
        description: `"${submission.title}" has been approved and is now live in the community.`,
      });
      // Remove from current list instead of full refresh for better UX
      setSubmissions(prev => prev.filter(s => s.id !== submission.id));
      setTotal(prev => prev - 1);
      fetchStats();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to approve submission',
      });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleReject = async () => {
    if (!previewSubmission || !rejectReason.trim()) return;

    try {
      setActionInProgress(previewSubmission.id);
      await adminApi.rejectCommunitySubmission(previewSubmission.id, rejectReason.trim());
      toast({
        title: 'Rejected',
        description: `"${previewSubmission.title}" has been rejected.`,
      });
      // Remove from current list
      setSubmissions(prev => prev.filter(s => s.id !== previewSubmission.id));
      setTotal(prev => prev - 1);
      setRejectDialogOpen(false);
      setRejectReason('');
      setPreviewSubmission(null);
      fetchStats();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to reject submission',
      });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRemove = async (submission: CommunitySubmission) => {
    try {
      setActionInProgress(submission.id);
      await adminApi.removeCommunityDeck(submission.id);
      toast({
        title: 'Removed',
        description: `"${submission.title}" has been removed from the community.`,
      });
      // Remove from current list
      setSubmissions(prev => prev.filter(s => s.id !== submission.id));
      setTotal(prev => prev - 1);
      fetchStats();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to remove deck',
      });
    } finally {
      setActionInProgress(null);
    }
  };

  const openRejectDialog = (submission: CommunitySubmission) => {
    setPreviewSubmission(submission);
    setRejectReason('');
    setRejectDialogOpen(true);
  };

  const openEditDialog = (submission: CommunitySubmission) => {
    setEditingSubmission(submission);
    setEditTitle(submission.title);
    setEditDescription(submission.description || '');
    setEditCategory(submission.category);
    setEditTags(submission.tags?.join(', ') || '');
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingSubmission) return;

    try {
      setActionInProgress(editingSubmission.id);
      const updates = {
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
        category: editCategory,
        tags: editTags.split(',').map(t => t.trim()).filter(Boolean),
      };
      await adminApi.updateCommunityDeck(editingSubmission.id, updates);
      toast({
        title: 'Updated',
        description: 'Community deck has been updated.',
      });
      // Update inline instead of full refresh
      setSubmissions(prev => prev.map(s =>
        s.id === editingSubmission.id
          ? { ...s, ...updates }
          : s
      ));
      setEditDialogOpen(false);
      setEditingSubmission(null);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update deck',
      });
    } finally {
      setActionInProgress(null);
    }
  };

  const getCategoryBadge = (category: string) => {
    const cat = COMMUNITY_CATEGORIES[category as keyof typeof COMMUNITY_CATEGORIES];
    return (
      <Badge
        variant="outline"
        style={{ borderColor: cat?.color, color: cat?.color }}
        className="text-xs"
      >
        {cat?.name || category}
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Pending</Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Approved</Badge>;
      case 'rejected':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <AdminLayoutV2>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Community</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Review and manage community slide submissions
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshList}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                  <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{stats?.pending || 0}</p>
                  <p className="text-xs text-gray-500">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <FileStack className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{stats?.approved || 0}</p>
                  <p className="text-xs text-gray-500">Approved</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{stats?.total_remixes || 0}</p>
                  <p className="text-xs text-gray-500">Total Remixes</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                  <Eye className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{stats?.total_views || 0}</p>
                  <p className="text-xs text-gray-500">Total Views</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabStatus)}>
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="pending" className="gap-2">
                Pending
                {stats?.pending ? <Badge variant="secondary" className="ml-1">{stats.pending}</Badge> : null}
              </TabsTrigger>
              <TabsTrigger value="approved">Approved</TabsTrigger>
              <TabsTrigger value="rejected">Rejected</TabsTrigger>
            </TabsList>

            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search submissions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <TabsContent value={activeTab} className="mt-6">
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <Skeleton className="h-32 w-full mb-3" />
                      <Skeleton className="h-4 w-3/4 mb-2" />
                      <Skeleton className="h-3 w-1/2" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : submissions.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Users className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-500">No {activeTab} submissions</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {submissions.map((submission) => (
                  <Card key={submission.id} className="overflow-hidden">
                    <CardContent className="p-0">
                      {/* Thumbnail */}
                      <div className="aspect-video bg-gray-100 dark:bg-gray-800 relative overflow-hidden">
                        {submission.first_slide ? (
                          <MiniSlide
                            slide={submission.first_slide}
                            className="w-full h-full"
                          />
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <FileStack className="h-8 w-8 text-gray-300" />
                          </div>
                        )}
                        <div className="absolute top-2 right-2">
                          {getCategoryBadge(submission.category)}
                        </div>
                      </div>

                      {/* Content */}
                      <div className="p-4">
                        <h3 className="font-medium text-sm truncate mb-1">{submission.title}</h3>
                        {submission.description && (
                          <p className="text-xs text-gray-500 line-clamp-2 mb-2">{submission.description}</p>
                        )}

                        <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                          <span>{submission.author_name || submission.author_email || 'Unknown'}</span>
                          <span className="text-gray-300">|</span>
                          <span>{submission.slide_count} slides</span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400">
                            {formatDistanceToNow(new Date(submission.submitted_at), { addSuffix: true })}
                          </span>

                          {activeTab === 'pending' ? (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8"
                                onClick={() => openEditDialog(submission)}
                                disabled={actionInProgress === submission.id}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => openRejectDialog(submission)}
                                disabled={actionInProgress === submission.id}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                className="h-8 bg-green-600 hover:bg-green-700"
                                onClick={() => handleApprove(submission)}
                                disabled={actionInProgress === submission.id}
                              >
                                <Check className="h-3.5 w-3.5 mr-1" />
                                Approve
                              </Button>
                            </div>
                          ) : activeTab === 'approved' ? (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8"
                                onClick={() => openEditDialog(submission)}
                                disabled={actionInProgress === submission.id}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => handleRemove(submission)}
                                disabled={actionInProgress === submission.id}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-1" />
                                Remove
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">
                              {submission.rejection_reason && (
                                <span title={submission.rejection_reason}>Reason: {submission.rejection_reason.slice(0, 30)}...</span>
                              )}
                            </span>
                          )}
                        </div>

                        {/* Tags */}
                        {submission.tags && submission.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t">
                            {submission.tags.slice(0, 3).map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                            {submission.tags.length > 3 && (
                              <Badge variant="secondary" className="text-xs">
                                +{submission.tags.length - 3}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Infinite scroll sentinel and loading indicator */}
            {!isLoading && submissions.length > 0 && (
              <div className="mt-6">
                <p className="text-sm text-gray-500 text-center mb-4">
                  Showing {submissions.length} of {total}
                </p>
                {/* Sentinel element for intersection observer */}
                <div ref={sentinelRef} className="h-4" />
                {isLoadingMore && (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                  </div>
                )}
                {!hasMore && submissions.length > 0 && (
                  <p className="text-sm text-gray-400 text-center py-2">
                    No more submissions
                  </p>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Submission</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting "{previewSubmission?.title}". This will be shown to the user.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for rejection..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="min-h-[100px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={!rejectReason.trim() || actionInProgress === previewSubmission?.id}
            >
              Reject Submission
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Community Deck</DialogTitle>
            <DialogDescription>
              Update the title, description, category, or tags for this community deck.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Deck title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Brief description of the deck"
                className="min-h-[80px]"
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(COMMUNITY_CATEGORIES).map(([key, cat]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setEditCategory(key)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-md border text-sm text-left transition-colors",
                      editCategory === key
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-input hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: cat.color }}
                    />
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-tags">Tags (comma-separated)</Label>
              <Input
                id="edit-tags"
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                placeholder="startup, pitch, funding"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={!editTitle.trim() || actionInProgress === editingSubmission?.id}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayoutV2>
  );
};

export default AdminCommunity;
