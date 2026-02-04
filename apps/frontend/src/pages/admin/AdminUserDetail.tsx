import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import AdminLayoutV2 from '@/components/admin/AdminLayoutV2';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  MoreVertical,
  Mail,
  Calendar,
  Clock,
  Shield,
  FileStack,
  Ban,
  Trash2,
  Key,
  CheckCircle,
  User,
  UserPlus,
  Loader2,
  Crown,
  LogOut,
  RefreshCw,
  UserCog,
  Coins,
  Copy,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { adminApi, UserDetail, DeckSummary, UserCredits } from '@/services/adminApi';
import { toast, useToast } from '@/hooks/use-toast';
import DeckThumbnail from '@/components/deck/DeckThumbnail';
import { CompleteDeckData } from '@/types/DeckTypes';
import DeckPreviewModal from '@/components/admin/DeckPreviewModal';

const AdminUserDetail: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
  const [userDecks, setUserDecks] = useState<DeckSummary[]>([]);
  const [userCredits, setUserCredits] = useState<UserCredits | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDecks, setIsLoadingDecks] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteType, setDeleteType] = useState<'soft' | 'hard'>('soft');
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'overview');
  const [error, setError] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Credits dialog state
  const [creditsDialogOpen, setCreditsDialogOpen] = useState(false);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [editedCredits, setEditedCredits] = useState({ total: 0, used: 0 });

  useEffect(() => {
    if (userId) {
      fetchUserDetail();
      fetchUserDecks();
      fetchUserCredits();
    }
  }, [userId]);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && (tab === 'overview' || tab === 'decks')) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const fetchUserDetail = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await adminApi.getUserDetail(userId!);
      setUserDetail(data);
    } catch (error: any) {
      console.error('Error fetching user detail:', error);
      setError(error.message || 'Failed to load user details.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUserDecks = async () => {
    try {
      setIsLoadingDecks(true);
      const response = await adminApi.getUserDecks(userId!);
      setUserDecks(response.decks);
    } catch (error) {
      console.error('Error fetching user decks:', error);
    } finally {
      setIsLoadingDecks(false);
    }
  };

  const fetchUserCredits = async () => {
    try {
      const credits = await adminApi.getUserCredits(userId!);
      setUserCredits(credits);
    } catch (error) {
      console.error('Error fetching user credits:', error);
    }
  };

  const openPreview = (index: number) => {
    setCurrentIndex(index);
    setIsPreviewOpen(true);
  };

  const openCreditsDialog = () => {
    if (userCredits) {
      // Combine monthly + purchased into total for simpler editing
      const total = userCredits.monthly_credits === -1
        ? -1
        : userCredits.monthly_credits + userCredits.purchased_credits;
      setEditedCredits({
        total,
        used: userCredits.used_credits,
      });
    }
    setCreditsDialogOpen(true);
  };

  const handleSaveCredits = async () => {
    try {
      setCreditsLoading(true);
      // Store total in monthly_credits, reset purchased_credits to 0
      await adminApi.updateUserCredits(userId!, {
        monthly_credits: editedCredits.total,
        purchased_credits: 0,
        used_credits: editedCredits.used,
      });
      toast({ title: 'Credits updated', description: 'User credits have been updated successfully' });
      setCreditsDialogOpen(false);
      fetchUserCredits();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update user credits', variant: 'destructive' });
    } finally {
      setCreditsLoading(false);
    }
  };

  const handleUpdateRole = async (newRole: 'user' | 'admin') => {
    try {
      setActionLoading('role');
      await adminApi.updateUser(userId!, { role: newRole });
      toast({ title: 'Role updated', description: `User role has been updated to ${newRole}` });
      fetchUserDetail();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update user role', variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSuspendUser = async () => {
    try {
      setActionLoading('suspend');
      await adminApi.performUserAction(userId!, { action: 'suspend' });
      toast({ title: 'User suspended', description: 'User has been suspended successfully' });
      fetchUserDetail();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to suspend user', variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReactivateUser = async () => {
    try {
      setActionLoading('reactivate');
      await adminApi.performUserAction(userId!, { action: 'reactivate' });
      toast({ title: 'User reactivated', description: 'User has been reactivated successfully' });
      fetchUserDetail();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to reactivate user', variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetPassword = async () => {
    if (!userDetail) return;
    try {
      setActionLoading('password');
      await adminApi.performUserAction(userId!, { action: 'reset_password' });
      toast({ title: 'Password reset email sent', description: `A password reset link has been sent to ${userDetail.user.email}` });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to send password reset email', variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleClearSessions = async () => {
    try {
      setActionLoading('sessions');
      await adminApi.performUserAction(userId!, { action: 'clear_sessions' });
      toast({ title: 'Sessions cleared', description: 'All user sessions have been invalidated' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to clear sessions', variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteUser = async () => {
    try {
      setActionLoading('delete');
      const action = deleteType === 'hard' ? 'hard_delete' : 'delete';
      await adminApi.performUserAction(userId!, { action });
      toast({
        title: deleteType === 'hard' ? 'User permanently deleted' : 'User deleted',
        description: deleteType === 'hard'
          ? 'User and all their data have been permanently removed'
          : 'User has been marked as deleted',
      });
      setDeleteDialogOpen(false);
      navigate('/admin/users');
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete user', variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied', description: 'Copied to clipboard' });
  };

  if (isLoading) {
    return (
      <AdminLayoutV2>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </AdminLayoutV2>
    );
  }

  if (error || !userDetail) {
    return (
      <AdminLayoutV2>
        <div className="text-center py-12">
          <p className="text-red-500">{error || 'User not found'}</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/admin/users')}>
            Back to Users
          </Button>
        </div>
      </AdminLayoutV2>
    );
  }

  const { user } = userDetail;
  const totalDecks = userDecks.length;
  const totalSlides = userDecks.reduce((sum, deck) => sum + deck.slideCount, 0);
  const remainingCredits = userCredits
    ? (userCredits.monthly_credits === -1 ? -1 : Math.max(0, userCredits.monthly_credits + userCredits.purchased_credits - userCredits.used_credits))
    : 0;

  return (
    <AdminLayoutV2>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/admin/users')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center text-white font-medium">
              {user.email?.charAt(0).toUpperCase() || '?'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold">{user.fullName || user.email}</h1>
                <Badge variant={user.status === 'active' ? 'outline' : 'destructive'} className="text-xs">
                  {user.status}
                </Badge>
                {user.role === 'admin' && (
                  <Badge className="text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300">
                    <Shield className="h-3 w-3 mr-1" />
                    Admin
                  </Badge>
                )}
              </div>
              <p className="text-sm text-gray-500">{user.email}</p>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={!!actionLoading}>
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="gap-2">
                  <UserCog className="h-4 w-4" />
                  Change Role
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => handleUpdateRole('user')} disabled={user.role === 'user'}>
                    <User className="h-4 w-4 mr-2" />
                    User
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleUpdateRole('admin')} disabled={user.role === 'admin'}>
                    <Crown className="h-4 w-4 mr-2" />
                    Admin
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleResetPassword}>
                <Key className="h-4 w-4 mr-2" />
                Reset Password
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleClearSessions}>
                <LogOut className="h-4 w-4 mr-2" />
                Clear Sessions
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {user.status === 'suspended' ? (
                <DropdownMenuItem onClick={handleReactivateUser} className="text-green-600">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reactivate
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={handleSuspendUser} className="text-orange-600">
                  <Ban className="h-4 w-4 mr-2" />
                  Suspend
                </DropdownMenuItem>
              )}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="gap-2 text-red-600">
                  <Trash2 className="h-4 w-4" />
                  Delete
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => { setDeleteType('soft'); setDeleteDialogOpen(true); }}>
                    Soft Delete
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setDeleteType('hard'); setDeleteDialogOpen(true); }} className="text-red-600">
                    Permanent Delete
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-9">
            <TabsTrigger value="overview" className="text-sm">Overview</TabsTrigger>
            <TabsTrigger value="decks" className="text-sm">Decks ({totalDecks})</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <div className="grid gap-4 md:grid-cols-2">
              {/* Account Info */}
              <Card>
                <CardContent className="p-4 space-y-3">
                  <h3 className="font-medium text-sm text-gray-500">Account</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-gray-500 text-xs">Email</p>
                      <div className="flex items-center gap-1">
                        <p className="font-medium truncate">{user.email}</p>
                        {user.emailConfirmedAt && <CheckCircle className="h-3 w-3 text-green-500 flex-shrink-0" />}
                      </div>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs">Provider</p>
                      <p className="font-medium capitalize">{user.provider || 'email'}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs">Joined</p>
                      <p className="font-medium">{format(new Date(user.createdAt), 'MMM d, yyyy')}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs">Last Sign In</p>
                      <p className="font-medium">
                        {user.lastSignInAt ? formatDistanceToNow(new Date(user.lastSignInAt), { addSuffix: true }) : 'Never'}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-gray-500 text-xs">User ID</p>
                      <div className="flex items-center gap-1">
                        <p className="font-mono text-xs truncate">{user.id}</p>
                        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => copyToClipboard(user.id)}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Usage & Credits */}
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-sm text-gray-500">Usage & Credits</h3>
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={openCreditsDialog}>
                      <Coins className="h-3 w-3 mr-1 text-orange-500" />
                      Edit Credits
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="text-center p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                      <p className="text-2xl font-bold">{totalDecks}</p>
                      <p className="text-xs text-gray-500">Decks</p>
                    </div>
                    <div className="text-center p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                      <p className="text-2xl font-bold">{totalSlides}</p>
                      <p className="text-xs text-gray-500">Slides</p>
                    </div>
                    <div className="text-center p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                      <p className="text-2xl font-bold text-orange-600">
                        {remainingCredits === -1 ? '∞' : remainingCredits}
                      </p>
                      <p className="text-xs text-gray-500">Tokens Left</p>
                    </div>
                  </div>
                  {userCredits && (
                    <p className="text-xs text-gray-400 text-center">
                      {userCredits.used_credits} used of {userCredits.monthly_credits === -1 ? '∞' : userCredits.monthly_credits + userCredits.purchased_credits} total
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="decks" className="mt-4">
            {isLoadingDecks ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="aspect-video rounded-lg" />)}
              </div>
            ) : userDecks.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <FileStack className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No decks created yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {userDecks.map((deck, index) => (
                  <Card
                    key={deck.id}
                    className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => openPreview(index)}
                  >
                    <CardContent className="p-0">
                      <div className="aspect-video bg-gray-100 dark:bg-gray-800 overflow-hidden">
                        <DeckThumbnail deck={deck as CompleteDeckData} />
                      </div>
                      <div className="p-3">
                        <h4 className="font-medium text-sm truncate">{deck.name}</h4>
                        <p className="text-xs text-gray-500">{deck.slideCount} slides</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className={deleteType === 'hard' ? 'text-red-600' : ''}>
              {deleteType === 'hard' ? 'Permanently Delete User' : 'Delete User'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteType === 'hard' ? (
                <span className="text-red-600">This will permanently delete the user and all their data. This cannot be undone.</span>
              ) : (
                'The user will be marked as deleted but their data will be preserved.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              className={deleteType === 'hard' ? 'bg-red-600 hover:bg-red-700' : ''}
            >
              {actionLoading === 'delete' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Credits Dialog */}
      <Dialog open={creditsDialogOpen} onOpenChange={setCreditsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-orange-500" />
              Edit User Tokens
            </DialogTitle>
            <DialogDescription>{user.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4 text-center">
              <p className="text-sm text-gray-500">Available Tokens</p>
              <p className="text-3xl font-bold text-orange-600">
                {editedCredits.total === -1 ? '∞' : Math.max(0, editedCredits.total - editedCredits.used)}
              </p>
              <p className="text-xs text-gray-400 mt-1">Plan: {userCredits?.plan_id || 'free'}</p>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Total Credits</Label>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editedCredits.total === -1}
                    onCheckedChange={(checked) =>
                      setEditedCredits(prev => ({ ...prev, total: checked ? -1 : 0 }))
                    }
                  />
                  <span className="text-xs text-gray-500">Unlimited</span>
                </div>
                {editedCredits.total !== -1 && (
                  <Input
                    type="number"
                    min={0}
                    value={editedCredits.total}
                    onChange={(e) => setEditedCredits(prev => ({ ...prev, total: parseInt(e.target.value) || 0 }))}
                    className="font-mono"
                  />
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Used Credits</Label>
                <Input
                  type="number"
                  value={editedCredits.used}
                  onChange={(e) => setEditedCredits(prev => ({ ...prev, used: parseInt(e.target.value) || 0 }))}
                  className="font-mono"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreditsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveCredits} disabled={creditsLoading} className="bg-orange-600 hover:bg-orange-700">
              {creditsLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deck Preview Modal */}
      {isPreviewOpen && (
        <DeckPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          decks={userDecks}
          currentIndex={currentIndex}
          onNavigate={setCurrentIndex}
        />
      )}
    </AdminLayoutV2>
  );
};

export default AdminUserDetail;
