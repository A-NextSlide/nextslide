import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AdminLayoutV2 from '@/components/admin/AdminLayoutV2';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
// Card imports removed - using compact admin-styled divs
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  User,
  FileStack,
  MoreVertical,
  ExternalLink,
  Users,
  Shield,
  CheckCircle,
  XCircle,
  Clock,
  Activity,
  Trash2,
  Ban,
  RefreshCw,
  Key,
  LogOut,
  UserCog,
  Crown,
  Loader2,
  Coins,
  Pencil
} from 'lucide-react';
import { format } from 'date-fns';
import { adminApi, UserSummary, UserStats, UserCredits } from '@/services/adminApi';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
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
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Shared design tokens (match AdminServices)
// ---------------------------------------------------------------------------
const sectionHeading = "text-[10px] font-bold uppercase tracking-wider text-[#FF4301]";
const cardClass = "bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-xl";

const AdminUsersV2: React.FC = () => {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<string>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [userStats, setUserStats] = useState<UserStats>({
    totalActive: 0,
    newThisWeek: 0,
    adminCount: 0,
    verifiedCount: 0
  });
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserSummary | null>(null);
  const [deleteType, setDeleteType] = useState<'soft' | 'hard'>('soft');
  const [creditsDialogOpen, setCreditsDialogOpen] = useState(false);
  const [userToEditCredits, setUserToEditCredits] = useState<UserSummary | null>(null);
  const [userCredits, setUserCredits] = useState<UserCredits | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [editedCredits, setEditedCredits] = useState<{ total: number; used: number }>({ total: 0, used: 0 });
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchUsers();
  }, [currentPage, sortBy, sortOrder, searchQuery, pageSize]);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      const response = await adminApi.getUsers({
        page: currentPage,
        limit: pageSize,
        search: searchQuery,
        sortBy,
        sortOrder,
      });

      setUsers(response.users);
      setTotalPages(response.totalPages);
      setTotalUsers(response.total);

      // Use stats from API response (calculated across all users, not just current page)
      setUserStats(response.stats);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setCurrentPage(1);
  };

  const handleSelectAll = () => {
    if (selectedUsers.size === users.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(users.map(u => u.id)));
    }
  };

  const handleSelectUser = (userId: string) => {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUsers(newSelected);
  };

  const handleExportUsers = async () => {
    try {
      const csvContent = [
        ['Email', 'Created At', 'Last Active', 'Admin', 'Verified', 'Decks'].join(','),
        ...users.map(user => [
          user.email,
          format(new Date(user.createdAt), 'yyyy-MM-dd'),
          user.lastActive ? format(new Date(user.lastActive), 'yyyy-MM-dd') : 'Never',
          user.isAdmin ? 'Yes' : 'No',
          user.emailVerified ? 'Yes' : 'No',
          user.deckCount.toString()
        ].join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `users_${format(new Date(), 'yyyy-MM-dd')}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting users:', error);
    }
  };

  // Sortable column header component
  const SortableHeader = ({ field, children }: { field: string; children: React.ReactNode }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
    >
      {children}
      {sortBy === field ? (
        sortOrder === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
      ) : (
        <ChevronDown className="h-3 w-3 opacity-30" />
      )}
    </button>
  );

  // User action handlers
  const handleUpdateRole = async (userId: string, newRole: 'user' | 'admin') => {
    try {
      setActionLoading(userId);
      await adminApi.updateUser(userId, { role: newRole });
      toast({
        title: 'Role updated',
        description: `User role has been updated to ${newRole}`,
      });
      fetchUsers();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update user role',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSuspendUser = async (userId: string) => {
    try {
      setActionLoading(userId);
      await adminApi.performUserAction(userId, { action: 'suspend' });
      toast({
        title: 'User suspended',
        description: 'User has been suspended successfully',
      });
      fetchUsers();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to suspend user',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReactivateUser = async (userId: string) => {
    try {
      setActionLoading(userId);
      await adminApi.performUserAction(userId, { action: 'reactivate' });
      toast({
        title: 'User reactivated',
        description: 'User has been reactivated successfully',
      });
      fetchUsers();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to reactivate user',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      setActionLoading(userToDelete.id);
      const action = deleteType === 'hard' ? 'hard_delete' : 'delete';
      await adminApi.performUserAction(userToDelete.id, { action });
      toast({
        title: deleteType === 'hard' ? 'User permanently deleted' : 'User deleted',
        description: deleteType === 'hard'
          ? 'User and all their data have been permanently removed'
          : 'User has been marked as deleted',
      });
      setDeleteDialogOpen(false);
      setUserToDelete(null);
      setDeleteType('soft');
      fetchUsers();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete user',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleClearSessions = async (userId: string) => {
    try {
      setActionLoading(userId);
      await adminApi.performUserAction(userId, { action: 'clear_sessions' });
      toast({
        title: 'Sessions cleared',
        description: 'All user sessions have been invalidated. They will need to sign in again.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to clear sessions',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetPassword = async (userId: string, email: string) => {
    try {
      setActionLoading(userId);
      await adminApi.performUserAction(userId, { action: 'reset_password' });
      toast({
        title: 'Password reset email sent',
        description: `A password reset link has been sent to ${email}`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to send password reset email',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const openDeleteDialog = (user: UserSummary, type: 'soft' | 'hard' = 'soft') => {
    setUserToDelete(user);
    setDeleteType(type);
    setDeleteDialogOpen(true);
  };

  const openCreditsDialog = async (user: UserSummary) => {
    setUserToEditCredits(user);
    setCreditsLoading(true);
    setCreditsDialogOpen(true);
    try {
      const credits = await adminApi.getUserCredits(user.id);
      setUserCredits(credits);
      // Combine monthly + purchased into total for simpler editing
      const total = credits.monthly_credits === -1
        ? -1
        : credits.monthly_credits + credits.purchased_credits;
      setEditedCredits({
        total,
        used: credits.used_credits,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load user credits',
        variant: 'destructive',
      });
      setCreditsDialogOpen(false);
    } finally {
      setCreditsLoading(false);
    }
  };

  const handleSaveCredits = async () => {
    if (!userToEditCredits || !userCredits) return;
    try {
      setCreditsLoading(true);
      // Store total in monthly_credits, reset purchased_credits to 0
      await adminApi.updateUserCredits(userToEditCredits.id, {
        monthly_credits: editedCredits.total,
        purchased_credits: 0,
        used_credits: editedCredits.used,
      });
      toast({
        title: 'Credits updated',
        description: 'User credits have been updated successfully',
      });
      setCreditsDialogOpen(false);
      setUserToEditCredits(null);
      setUserCredits(null);
      // Refresh the users list to show updated credits
      fetchUsers();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update user credits',
        variant: 'destructive',
      });
    } finally {
      setCreditsLoading(false);
    }
  };

  const getActivityStatus = (lastActive: string | null): { label: string; color: string } => {
    if (!lastActive) return { label: 'Never', color: 'text-gray-500' };
    
    const daysSinceActive = Math.floor((Date.now() - new Date(lastActive).getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysSinceActive === 0) return { label: 'Today', color: 'text-green-600 dark:text-green-400' };
    if (daysSinceActive === 1) return { label: 'Yesterday', color: 'text-green-600 dark:text-green-400' };
    if (daysSinceActive <= 7) return { label: `${daysSinceActive}d ago`, color: 'text-blue-600 dark:text-blue-400' };
    if (daysSinceActive <= 30) return { label: `${Math.floor(daysSinceActive / 7)}w ago`, color: 'text-orange-600 dark:text-orange-400' };
    return { label: `${Math.floor(daysSinceActive / 30)}mo ago`, color: 'text-gray-500' };
  };

  const renderSkeletonRows = () => (
    [...Array(5)].map((_, i) => (
      <TableRow key={i} className="h-12">
        <TableCell className="py-2">
          <Skeleton className="h-4 w-4" />
        </TableCell>
        <TableCell className="py-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="space-y-1">
              <Skeleton className="h-3.5 w-36" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        </TableCell>
        <TableCell className="py-2">
          <Skeleton className="h-3.5 w-16" />
        </TableCell>
        <TableCell className="py-2">
          <Skeleton className="h-5 w-16 rounded-full" />
        </TableCell>
        <TableCell className="py-2">
          <Skeleton className="h-5 w-14 rounded-full" />
        </TableCell>
        <TableCell className="py-2">
          <Skeleton className="h-5 w-10" />
        </TableCell>
        <TableCell className="py-2">
          <Skeleton className="h-3.5 w-8" />
        </TableCell>
        <TableCell className="py-2">
          <Skeleton className="h-6 w-6 rounded" />
        </TableCell>
      </TableRow>
    ))
  );

  return (
    <AdminLayoutV2>
      <div className="w-full space-y-3">
        {/* ── Page header ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold uppercase tracking-wider" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
              Users
            </h1>
            <span className="text-[11px] font-mono text-[#666] dark:text-[#888]">
              {totalUsers.toLocaleString()}
            </span>
          </div>
          <span className="text-[10px] text-[#888]">{userStats.newThisWeek} new this week</span>
        </div>

        {/* ── Overview ── */}
        <section>
          <h2 className={sectionHeading} style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>Overview</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1.5">
            <div className={cn(cardClass, "p-2.5")}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-[#888] flex items-center gap-1"><Users className="h-3 w-3" />Total</span>
              </div>
              <div className="text-lg font-semibold tabular-nums leading-tight">{totalUsers.toLocaleString()}</div>
            </div>
            <div className={cn(cardClass, "p-2.5")}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-[#888] flex items-center gap-1"><Activity className="h-3 w-3" />Active (7d)</span>
              </div>
              <div className="text-lg font-semibold tabular-nums leading-tight">{userStats.totalActive}</div>
            </div>
            <div className={cn(cardClass, "p-2.5")}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-[#888] flex items-center gap-1"><Shield className="h-3 w-3" />Admins</span>
              </div>
              <div className="text-lg font-semibold tabular-nums leading-tight">{userStats.adminCount}</div>
            </div>
            <div className={cn(cardClass, "p-2.5")}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-[#888] flex items-center gap-1"><CheckCircle className="h-3 w-3" />Verified</span>
              </div>
              <div className="text-lg font-semibold tabular-nums leading-tight">{userStats.verifiedCount}</div>
            </div>
          </div>
        </section>

        {/* ── Directory ── */}
        <section>
          <h2 className={sectionHeading} style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>Directory</h2>
          <div className="relative mt-1.5">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#999] h-3.5 w-3.5" />
          <Input
            placeholder="Search by email or name..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9 h-9 text-sm bg-white dark:bg-[#111] border-[#eaeaea] dark:border-[#333]"
          />
        </div>

        {/* Users Table */}
        <div className={cn(cardClass, "overflow-x-auto")}>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent h-9">
                    <TableHead className="w-[36px] py-1.5 pl-3">
                      <input
                        type="checkbox"
                        checked={selectedUsers.size === users.length && users.length > 0}
                        onChange={handleSelectAll}
                        className="rounded border-[#ddd] dark:border-[#555] h-3.5 w-3.5"
                      />
                    </TableHead>
                    <TableHead className="py-1.5 text-[11px] text-[#888]">
                      <SortableHeader field="email">User</SortableHeader>
                    </TableHead>
                    <TableHead className="py-1.5 text-[11px] text-[#888]">
                      <SortableHeader field="lastActive">Active</SortableHeader>
                    </TableHead>
                    <TableHead className="py-1.5 text-[11px] text-[#888]">
                      <SortableHeader field="status">Status</SortableHeader>
                    </TableHead>
                    <TableHead className="py-1.5 text-[11px] text-[#888]">
                      <SortableHeader field="role">Role</SortableHeader>
                    </TableHead>
                    <TableHead className="py-1.5 text-[11px] text-[#888]">
                      Tokens
                    </TableHead>
                    <TableHead className="py-1.5 text-[11px] text-[#888]">
                      <SortableHeader field="deckCount">Decks</SortableHeader>
                    </TableHead>
                    <TableHead className="w-[36px] py-1.5"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? renderSkeletonRows() : users.map((user) => {
                    const activityStatus = getActivityStatus(user.lastActive);
                    return (
                      <TableRow key={user.id} className="hover:bg-[#fafafa] dark:hover:bg-[#161616] h-10">
                        <TableCell className="py-1.5 pl-3">
                          <input
                            type="checkbox"
                            checked={selectedUsers.has(user.id)}
                            onChange={() => handleSelectUser(user.id)}
                            className="rounded border-[#ddd] dark:border-[#555] h-3.5 w-3.5"
                          />
                        </TableCell>
                        <TableCell className="py-1.5">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-[#111] dark:bg-[#333] flex items-center justify-center text-white text-[11px] font-medium flex-shrink-0">
                              {user.email.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-[13px] truncate">{user.email}</p>
                              <p className="text-[10px] text-[#999]">
                                {format(new Date(user.createdAt), 'MMM d, yyyy')}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-1.5">
                          <span className={cn("text-[11px] font-medium", activityStatus.color)}>
                            {activityStatus.label}
                          </span>
                        </TableCell>
                        <TableCell className="py-1.5">
                          {user.status === 'suspended' ? (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400">Suspended</span>
                          ) : user.status === 'deleted' ? (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400">Deleted</span>
                          ) : user.emailVerified ? (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">Verified</span>
                          ) : (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#f5f5f5] text-[#888] dark:bg-[#222] dark:text-[#666]">Pending</span>
                          )}
                        </TableCell>
                        <TableCell className="py-1.5">
                          {user.isAdmin ? (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300">Admin</span>
                          ) : (
                            <span className="text-[10px] text-[#888]">User</span>
                          )}
                        </TableCell>
                        <TableCell className="py-1.5">
                          <div className="flex items-center gap-1">
                            <span className="text-[11px] font-medium tabular-nums">
                              {user.creditsRemaining === -1 ? '∞' : user.creditsRemaining}
                            </span>
                            <span className="text-[10px] text-[#ccc] dark:text-[#555]">/</span>
                            <span className="text-[10px] text-[#999] tabular-nums">
                              {user.creditsTotal === -1 ? '∞' : user.creditsTotal}
                            </span>
                            <button
                              className="ml-1 hover:text-[#FF4301] text-[#ccc] dark:text-[#555] transition-colors"
                              onClick={() => openCreditsDialog(user)}
                            >
                              <Pencil className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        </TableCell>
                        <TableCell className="py-1.5">
                          <button
                            onClick={() => navigate(`/admin/users/${user.id}?tab=decks`)}
                            className="text-[11px] font-medium tabular-nums hover:text-[#FF4301] transition-colors"
                          >
                            {user.deckCount}
                          </button>
                        </TableCell>
                        <TableCell className="py-1.5">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6" disabled={actionLoading === user.id}>
                                {actionLoading === user.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <MoreVertical className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuLabel>User Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem asChild>
                                <Link to={`/admin/users/${user.id}`} className="flex items-center gap-2">
                                  <ExternalLink className="h-4 w-4" />
                                  View Details
                                </Link>
                              </DropdownMenuItem>

                              {/* Role Management */}
                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger className="gap-2">
                                  <UserCog className="h-4 w-4" />
                                  Change Role
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent>
                                  <DropdownMenuItem
                                    onClick={() => handleUpdateRole(user.id, 'user')}
                                    disabled={user.role === 'user'}
                                    className="gap-2"
                                  >
                                    <User className="h-4 w-4" />
                                    Set as User
                                    {user.role === 'user' && <CheckCircle className="h-3 w-3 ml-auto text-green-500" />}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleUpdateRole(user.id, 'admin')}
                                    disabled={user.role === 'admin'}
                                    className="gap-2"
                                  >
                                    <Crown className="h-4 w-4" />
                                    Set as Admin
                                    {user.role === 'admin' && <CheckCircle className="h-3 w-3 ml-auto text-green-500" />}
                                  </DropdownMenuItem>
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>

                              <DropdownMenuSeparator />

                              {/* Account Management */}
                              <DropdownMenuItem
                                onClick={() => handleResetPassword(user.id, user.email)}
                                className="gap-2"
                              >
                                <Key className="h-4 w-4" />
                                Send Password Reset
                              </DropdownMenuItem>

                              <DropdownMenuItem
                                onClick={() => handleClearSessions(user.id)}
                                className="gap-2"
                              >
                                <LogOut className="h-4 w-4" />
                                Clear All Sessions
                              </DropdownMenuItem>

                              <DropdownMenuSeparator />

                              {/* Status Actions */}
                              {user.status === 'suspended' ? (
                                <DropdownMenuItem
                                  onClick={() => handleReactivateUser(user.id)}
                                  className="gap-2 text-green-600"
                                >
                                  <RefreshCw className="h-4 w-4" />
                                  Reactivate User
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onClick={() => handleSuspendUser(user.id)}
                                  className="gap-2 text-orange-600"
                                >
                                  <Ban className="h-4 w-4" />
                                  Suspend User
                                </DropdownMenuItem>
                              )}

                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger className="gap-2 text-red-600">
                                  <Trash2 className="h-4 w-4" />
                                  Delete User
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent>
                                  <DropdownMenuItem
                                    onClick={() => openDeleteDialog(user, 'soft')}
                                    className="gap-2"
                                  >
                                    <Ban className="h-4 w-4" />
                                    Soft Delete
                                    <span className="text-xs text-gray-500 ml-auto">Preserves data</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => openDeleteDialog(user, 'hard')}
                                    className="gap-2 text-red-600"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    Permanent Delete
                                    <span className="text-xs text-red-500 ml-auto">Cannot undo</span>
                                  </DropdownMenuItem>
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-3">
            <span className="text-[#888]">
              {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, totalUsers)} of {totalUsers}
            </span>
            <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}>
              <SelectTrigger className="w-[60px] h-7 text-[11px] border-[#eaeaea] dark:border-[#333]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="200">200</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="px-2 py-1 rounded border border-[#eaeaea] dark:border-[#333] hover:bg-[#f5f5f5] dark:hover:bg-[#222] disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="h-3 w-3" />
              </button>
              {[...Array(Math.min(5, totalPages))].map((_, i) => {
                const pageNum = i + 1;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={cn(
                      "w-7 h-7 rounded transition-colors",
                      currentPage === pageNum
                        ? "bg-[#FF4301] text-white font-medium"
                        : "border border-[#eaeaea] dark:border-[#333] hover:bg-[#f5f5f5] dark:hover:bg-[#222]"
                    )}
                  >
                    {pageNum}
                  </button>
                );
              })}
              {totalPages > 5 && <span className="px-1 text-[#999]">...</span>}
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="px-2 py-1 rounded border border-[#eaeaea] dark:border-[#333] hover:bg-[#f5f5f5] dark:hover:bg-[#222] disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
        </section>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className={deleteType === 'hard' ? 'text-red-600' : ''}>
              {deleteType === 'hard' ? 'Permanently Delete User' : 'Delete User'}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Are you sure you want to {deleteType === 'hard' ? 'permanently' : ''} delete <strong>{userToDelete?.email}</strong>?
              </p>
              {deleteType === 'hard' ? (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3 mt-2">
                  <p className="text-red-700 dark:text-red-300 font-medium text-sm">
                    Warning: This action cannot be undone!
                  </p>
                  <ul className="text-red-600 dark:text-red-400 text-sm mt-1 list-disc list-inside">
                    <li>The user will be removed from Supabase Auth</li>
                    <li>All user decks will be permanently deleted</li>
                    <li>The user record will be removed from the database</li>
                  </ul>
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  The user will be marked as deleted. Their data will be preserved but they will no longer be able to access the platform.
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setUserToDelete(null);
              setDeleteType('soft');
            }}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              className={deleteType === 'hard' ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-600 hover:bg-orange-700'}
              disabled={actionLoading === userToDelete?.id}
            >
              {actionLoading === userToDelete?.id ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                deleteType === 'hard' ? 'Permanently Delete' : 'Delete User'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Credits Dialog */}
      <Dialog open={creditsDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setCreditsDialogOpen(false);
          setUserToEditCredits(null);
          setUserCredits(null);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-orange-500" />
              Edit User Tokens
            </DialogTitle>
            <DialogDescription>
              {userToEditCredits?.email}
            </DialogDescription>
          </DialogHeader>
          {creditsLoading && !userCredits ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
            </div>
          ) : userCredits ? (
            <div className="space-y-4 py-4">
              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
                <div className="text-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Available Tokens</p>
                  <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">
                    {editedCredits.total === -1 ? '∞' : Math.max(0, editedCredits.total - editedCredits.used)}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Plan: {userCredits.plan_id}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="total-credits">Total Credits</Label>
                  <Input
                    id="total-credits"
                    type="number"
                    value={editedCredits.total}
                    onChange={(e) => setEditedCredits(prev => ({ ...prev, total: parseInt(e.target.value) || 0 }))}
                    min={-1}
                    className="font-mono"
                  />
                  <p className="text-xs text-gray-500">Use -1 for unlimited</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="used-credits">Used Credits</Label>
                  <Input
                    id="used-credits"
                    type="number"
                    value={editedCredits.used}
                    onChange={(e) => setEditedCredits(prev => ({ ...prev, used: parseInt(e.target.value) || 0 }))}
                    min={0}
                    className="font-mono"
                  />
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreditsDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveCredits}
              disabled={creditsLoading}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {creditsLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayoutV2>
  );
};

export default AdminUsersV2;