import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import AdminLayout from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
  ArrowLeft,
  MoreVertical,
  Mail,
  Calendar,
  Clock,
  Shield,
  FileStack,
  Activity,
  Download,
  RefreshCw,
  Ban,
  Trash2,
  Key,
  CheckCircle,
  Eye,
  Edit,
  AlertTriangle,
  UserPlus,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { adminApi, UserDetail, DeckSummary } from '@/services/adminApi';
import { toast } from '@/hooks/use-toast';
import DeckThumbnail from '@/components/deck/DeckThumbnail';
import { CompleteDeckData } from '@/types/DeckTypes';
import DeckPreviewModal from '@/components/admin/DeckPreviewModal';

interface CalculatedMetrics {
  totalDecks: number;
  totalSlides: number;
}

const AdminUserDetail: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
  const [userDecks, setUserDecks] = useState<DeckSummary[]>([]);
  const [calculatedMetrics, setCalculatedMetrics] = useState<CalculatedMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDecks, setIsLoadingDecks] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showSuspendDialog, setShowSuspendDialog] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [error, setError] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (userId) {
      fetchUserDetail();
      fetchUserDecks();
    }
  }, [userId]);

  const fetchUserDetail = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await adminApi.getUserDetail(userId!);
      setUserDetail(data);
    } catch (error: any) {
      console.error('Error fetching user detail:', error);
      const errorMessage = error.message || 'Failed to load user details.';
      if (errorMessage.includes('jsonb_typeof')) {
        setError('Database Error: The user `metadata` column is likely of type TEXT instead of JSONB. Please migrate the column type in your database.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUserDecks = async () => {
    try {
      setIsLoadingDecks(true);
      const response = await adminApi.getUserDecks(userId!);
      setUserDecks(response.decks);
      const totalDecks = response.total;
      const totalSlides = response.decks.reduce((sum, deck) => sum + deck.slideCount, 0);
      setCalculatedMetrics({ totalDecks, totalSlides });
    } catch (error) {
      console.error('Error fetching user decks:', error);
    } finally {
      setIsLoadingDecks(false);
    }
  };

  const openPreview = (index: number) => {
    setCurrentIndex(index);
    setIsPreviewOpen(true);
  };

  const handleAction = async (action: string) => {
    // Action handling logic...
  };

  if (isLoading) {
    return <AdminLayout><div className="p-8">{/* Skeleton */}</div></AdminLayout>;
  }

  if (error) {
    return <AdminLayout><div className="p-8 text-center">{/* Error */}</div></AdminLayout>;
  }

  if (!userDetail) {
    return <AdminLayout><div className="p-8 text-center">{/* Not Found */}</div></AdminLayout>;
  }

  const { user } = userDetail;

  return (
    <AdminLayout>
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/admin/users')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Avatar className="h-12 w-12">
              <AvatarImage src={user.avatarUrl} />
              <AvatarFallback>{user.email ? user.email.charAt(0).toUpperCase() : '?'}</AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-bold">{user.fullName || 'Unnamed User'}</h1>
              <p className="text-muted-foreground">{user.email}</p>
            </div>
            <Badge variant={user.status === 'active' ? 'default' : 'destructive'}>{user.status}</Badge>
            <Badge variant="outline">{user.role}</Badge>
          </div>
          {/* Dropdown Menu */}
        </div>

        {/* Quick Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
          {/* Stats Cards */}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="decks">Decks ({calculatedMetrics?.totalDecks ?? 0})</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid gap-6">
              {/* Account Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Account Information</CardTitle>
                  <CardDescription>Basic account details and status</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Email</p>
                      <p className="flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        {user.email}
                        {user.emailConfirmedAt && (
                          <Badge variant="outline" className="text-xs">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Verified
                          </Badge>
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Full Name</p>
                      <p>{user.fullName || 'Not set'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">User ID</p>
                      <p className="font-mono text-xs">{user.id}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Provider</p>
                      <p className="capitalize">{user.provider}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Status</p>
                      <Badge variant={user.status === 'active' ? 'default' : 'destructive'}>
                        {user.status}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Role</p>
                      <Badge variant="outline">{user.role}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Activity Timeline */}
              <Card>
                <CardHeader>
                  <CardTitle>Activity Timeline</CardTitle>
                  <CardDescription>Important dates and activities</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-4">
                    <div className="flex items-start gap-4">
                      <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
                        <UserPlus className="h-4 w-4 text-green-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Account Created</p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(user.createdAt), 'PPP')} ({formatDistanceToNow(new Date(user.createdAt))} ago)
                        </p>
                      </div>
                    </div>
                    {user.emailConfirmedAt && (
                      <div className="flex items-start gap-4">
                        <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                          <Mail className="h-4 w-4 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Email Verified</p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(user.emailConfirmedAt), 'PPP')}
                          </p>
                        </div>
                      </div>
                    )}
                    {user.lastSignInAt && (
                      <div className="flex items-start gap-4">
                        <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center">
                          <Clock className="h-4 w-4 text-purple-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Last Sign In</p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(user.lastSignInAt), 'PPP')} ({formatDistanceToNow(new Date(user.lastSignInAt))} ago)
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Usage Metrics */}
              {userDetail.metrics && (
                <Card>
                  <CardHeader>
                    <CardTitle>Usage Metrics</CardTitle>
                    <CardDescription>Account usage and activity statistics</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center">
                        <p className="text-2xl font-bold">{userDetail.metrics.totalDecks}</p>
                        <p className="text-sm text-muted-foreground">Total Decks</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold">{userDetail.metrics.totalSlides}</p>
                        <p className="text-sm text-muted-foreground">Total Slides</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold">{userDetail.metrics.collaborations}</p>
                        <p className="text-sm text-muted-foreground">Collaborations</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold">{(userDetail.metrics.storageUsed / 1024 / 1024).toFixed(1)} MB</p>
                        <p className="text-sm text-muted-foreground">Storage Used</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Recent Activity */}
              {userDetail.recentActivity && userDetail.recentActivity.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Activity</CardTitle>
                    <CardDescription>Latest actions performed by this user</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {userDetail.recentActivity.slice(0, 5).map((activity) => (
                        <div key={activity.id} className="flex items-start gap-3">
                          <Activity className="h-4 w-4 mt-0.5 text-muted-foreground" />
                          <div className="flex-1">
                            <p className="text-sm">{activity.type}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(activity.createdAt))} ago
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="decks">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {isLoadingDecks ? (
                [...Array(5)].map((_, i) => <Skeleton key={i} className="h-48 w-full" />)
              ) : userDecks.length === 0 ? (
                <div className="col-span-full text-center py-12 text-muted-foreground">
                  <FileStack className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No decks created yet</p>
                </div>
              ) : (
                userDecks.map((deck, index) => (
                  <Card 
                    key={deck.id} 
                    className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
                    onClick={() => openPreview(index)}
                  >
                    <CardContent className="p-0">
                      <div className="aspect-video bg-muted overflow-hidden">
                        <DeckThumbnail deck={deck as CompleteDeckData} />
                      </div>
                      <div className="p-4">
                        <h4 className="font-semibold truncate">{deck.name}</h4>
                        <p className="text-sm text-muted-foreground mt-1">{deck.slideCount} slides</p>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="activity">{/* Activity Content */}</TabsContent>
          <TabsContent value="details">{/* Details Content */}</TabsContent>
        </Tabs>
      </div>
      
      {isPreviewOpen && (
        <DeckPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          decks={userDecks}
          currentIndex={currentIndex}
          onNavigate={setCurrentIndex}
        />
      )}
    </AdminLayout>
  );
};

export default AdminUserDetail;
