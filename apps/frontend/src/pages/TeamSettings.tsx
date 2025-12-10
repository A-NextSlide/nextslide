import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/context/SupabaseAuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Users,
  Shield,
  UserPlus,
  X,
  ArrowLeft,
  Settings,
  Crown,
  MoreHorizontal,
  Mail,
  Loader2,
  Plus,
  Building2,
  ChevronDown,
  Check,
  Trash2,
  Clock,
  AlertCircle,
  Copy,
  Pencil,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { teamsApi, Team, TeamMember } from '@/services/teamsApi';

type TeamRole = 'owner' | 'admin' | 'member';

interface PendingInvitation {
  id: string;
  email: string;
  role: TeamRole;
  created_at: string;
  expires_at: string;
  token: string;
}

const TeamSettings: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Teams state
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);

  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [isMembersLoading, setIsMembersLoading] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [isDeletingTeam, setIsDeletingTeam] = useState(false);
  const [isUpdatingTeam, setIsUpdatingTeam] = useState(false);

  // Form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [newTeamName, setNewTeamName] = useState('');
  const [editTeamName, setEditTeamName] = useState('');

  // Dialogs
  const [showCreateTeamDialog, setShowCreateTeamDialog] = useState(false);
  const [showDeleteTeamDialog, setShowDeleteTeamDialog] = useState(false);
  const [showEditTeamDialog, setShowEditTeamDialog] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);

  const selfEmail = (user?.email || '').toLowerCase();
  const selfUserId = user?.id;

  // Find current user's role in selected team
  const myRole = members.find((m) => m.user_id === selfUserId)?.role || 'member';
  const canManageMembers = myRole === 'owner' || myRole === 'admin';
  const isOwner = myRole === 'owner';

  // Load teams on mount
  const loadTeams = useCallback(async () => {
    setIsLoading(true);
    try {
      const teamsList = await teamsApi.listTeams();
      setTeams(teamsList);
      if (teamsList.length > 0 && !selectedTeam) {
        setSelectedTeam(teamsList[0]);
      }
    } catch (error) {
      console.error('Failed to load teams:', error);
      // If no teams exist, that's fine - show empty state
    } finally {
      setIsLoading(false);
    }
  }, [selectedTeam]);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  // Load members when team changes
  const loadMembers = useCallback(async () => {
    if (!selectedTeam) {
      setMembers([]);
      return;
    }
    setIsMembersLoading(true);
    try {
      const membersList = await teamsApi.listMembers(selectedTeam.id);
      setMembers(membersList);

      // Try to load pending invitations (may fail if endpoint doesn't exist)
      try {
        const invitations = await teamsApi.listInvitations(selectedTeam.id);
        setPendingInvitations(invitations as PendingInvitation[]);
      } catch {
        setPendingInvitations([]);
      }
    } catch (error) {
      console.error('Failed to load members:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load team members',
      });
    } finally {
      setIsMembersLoading(false);
    }
  }, [selectedTeam]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  // Create team
  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;
    setIsCreatingTeam(true);
    try {
      const team = await teamsApi.createTeam(newTeamName.trim());
      setTeams((prev) => [...prev, { ...team, role: 'owner' }]);
      setSelectedTeam({ ...team, role: 'owner' });
      setNewTeamName('');
      setShowCreateTeamDialog(false);
      toast({
        title: 'Team created',
        description: `"${team.name}" has been created successfully.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to create team',
        description: error.message || 'Please try again',
      });
    } finally {
      setIsCreatingTeam(false);
    }
  };

  // Update team name
  const handleUpdateTeam = async () => {
    if (!selectedTeam || !editTeamName.trim()) return;
    setIsUpdatingTeam(true);
    try {
      await teamsApi.updateTeam(selectedTeam.id, editTeamName.trim());
      setTeams((prev) =>
        prev.map((t) => (t.id === selectedTeam.id ? { ...t, name: editTeamName.trim() } : t))
      );
      setSelectedTeam((prev) => (prev ? { ...prev, name: editTeamName.trim() } : null));
      setShowEditTeamDialog(false);
      toast({
        title: 'Team updated',
        description: 'Team name has been updated.',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to update team',
        description: error.message || 'Please try again',
      });
    } finally {
      setIsUpdatingTeam(false);
    }
  };

  // Delete team
  const handleDeleteTeam = async () => {
    if (!selectedTeam) return;
    setIsDeletingTeam(true);
    try {
      await teamsApi.deleteTeam(selectedTeam.id);
      const remaining = teams.filter((t) => t.id !== selectedTeam.id);
      setTeams(remaining);
      setSelectedTeam(remaining[0] || null);
      setShowDeleteTeamDialog(false);
      toast({
        title: 'Team deleted',
        description: 'The team has been permanently deleted.',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to delete team',
        description: error.message || 'Please try again',
      });
    } finally {
      setIsDeletingTeam(false);
    }
  };

  // Invite member
  const handleInviteMember = async () => {
    if (!selectedTeam || !inviteEmail.trim()) return;
    const email = inviteEmail.trim().toLowerCase();

    // Check if already a member
    if (members.some((m) => m.email?.toLowerCase() === email)) {
      toast({
        variant: 'destructive',
        title: 'Already a member',
        description: 'This person is already in the team.',
      });
      return;
    }

    setIsAddingMember(true);
    try {
      const result = await teamsApi.addMember(selectedTeam.id, email, inviteRole);

      if (result.user_id) {
        // User was added directly
        toast({
          title: 'Member added',
          description: `${email} has been added to the team.`,
        });
        loadMembers();
      } else if (result.invitation_id) {
        // Invitation was created
        toast({
          title: 'Invitation sent',
          description: `An invitation has been sent to ${email}.`,
        });
        // Add to pending invitations locally
        setPendingInvitations((prev) => [
          ...prev,
          {
            id: result.invitation_id!,
            email,
            role: inviteRole,
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
            token: result.token || '',
          },
        ]);
      }
      setInviteEmail('');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to invite',
        description: error.message || 'Please try again',
      });
    } finally {
      setIsAddingMember(false);
    }
  };

  // Update member role
  const handleUpdateRole = async (member: TeamMember, newRole: TeamRole) => {
    if (!selectedTeam || member.role === newRole) return;

    // Prevent demoting self if last owner
    if (member.user_id === selfUserId && member.role === 'owner') {
      const ownerCount = members.filter((m) => m.role === 'owner').length;
      if (ownerCount <= 1 && newRole !== 'owner') {
        toast({
          variant: 'destructive',
          title: 'Cannot change role',
          description: 'There must be at least one owner.',
        });
        return;
      }
    }

    try {
      await teamsApi.updateMemberRole(selectedTeam.id, member.user_id, newRole);
      setMembers((prev) =>
        prev.map((m) => (m.user_id === member.user_id ? { ...m, role: newRole } : m))
      );
      toast({
        title: 'Role updated',
        description: `${member.email}'s role has been changed to ${newRole}.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to update role',
        description: error.message || 'Please try again',
      });
    }
  };

  // Remove member
  const handleRemoveMember = async () => {
    if (!selectedTeam || !memberToRemove) return;

    // Prevent removing last owner
    if (memberToRemove.role === 'owner') {
      const ownerCount = members.filter((m) => m.role === 'owner').length;
      if (ownerCount <= 1) {
        toast({
          variant: 'destructive',
          title: 'Cannot remove',
          description: 'Cannot remove the last owner.',
        });
        setMemberToRemove(null);
        return;
      }
    }

    try {
      await teamsApi.removeMember(selectedTeam.id, memberToRemove.user_id);
      setMembers((prev) => prev.filter((m) => m.user_id !== memberToRemove.user_id));
      toast({
        title: 'Member removed',
        description: `${memberToRemove.email} has been removed from the team.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to remove member',
        description: error.message || 'Please try again',
      });
    } finally {
      setMemberToRemove(null);
    }
  };

  // Copy invite link
  const copyInviteLink = (token: string) => {
    const url = `${window.location.origin}/team/invite/${token}`;
    navigator.clipboard.writeText(url);
    toast({
      title: 'Link copied',
      description: 'Invitation link has been copied to clipboard.',
    });
  };

  // Cancel invitation
  const handleCancelInvitation = async (invitation: PendingInvitation) => {
    if (!selectedTeam) return;
    try {
      await teamsApi.cancelInvitation(selectedTeam.id, invitation.id);
      setPendingInvitations((prev) => prev.filter((i) => i.id !== invitation.id));
      toast({
        title: 'Invitation canceled',
        description: `The invitation to ${invitation.email} has been canceled.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to cancel invitation',
        description: error.message || 'Please try again',
      });
    }
  };

  // Get initials from email
  const getInitials = (email: string, name?: string) => {
    if (name) {
      const parts = name.split(' ');
      if (parts.length >= 2) {
        return parts[0][0].toUpperCase() + parts[parts.length - 1][0].toUpperCase();
      }
      return name[0].toUpperCase();
    }
    return email.substring(0, 2).toUpperCase();
  };

  // Role badge color
  const getRoleBadgeVariant = (role: TeamRole): 'default' | 'secondary' | 'outline' => {
    switch (role) {
      case 'owner':
        return 'default';
      case 'admin':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  // Role icon
  const RoleIcon = ({ role }: { role: TeamRole }) => {
    switch (role) {
      case 'owner':
        return <Crown className="h-3 w-3" />;
      case 'admin':
        return <Shield className="h-3 w-3" />;
      default:
        return null;
    }
  };

  // Enable scrolling on this page
  useEffect(() => {
    document.documentElement.style.position = '';
    document.documentElement.style.overflow = '';
    document.body.style.position = '';
    document.body.style.overflow = '';

    return () => {
      document.documentElement.style.position = 'fixed';
      document.documentElement.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.overflow = 'hidden';
    };
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/app')}
              className="gap-2 -ml-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </Button>
            <Separator orientation="vertical" className="h-5" />
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Team Settings</span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar */}
          <aside className="lg:w-64 flex-shrink-0">
            {/* Team Selector Card */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 mb-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-medium text-muted-foreground">Your Teams</p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setShowCreateTeamDialog(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : teams.length === 0 ? (
                <div className="text-center py-6">
                  <Building2 className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-sm text-muted-foreground mb-4">No teams yet</p>
                  <Button size="sm" onClick={() => setShowCreateTeamDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Team
                  </Button>
                </div>
              ) : (
                <div className="space-y-1">
                  {teams.map((team) => (
                    <button
                      key={team.id}
                      onClick={() => setSelectedTeam(team)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left',
                        selectedTeam?.id === team.id
                          ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                          : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      )}
                    >
                      <div
                        className={cn(
                          'h-8 w-8 rounded-lg flex items-center justify-center text-xs font-medium',
                          selectedTeam?.id === team.id
                            ? 'bg-white/20 dark:bg-zinc-900/20'
                            : 'bg-zinc-100 dark:bg-zinc-800'
                        )}
                      >
                        {team.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{team.name}</p>
                        <p
                          className={cn(
                            'text-xs truncate',
                            selectedTeam?.id === team.id
                              ? 'text-white/70 dark:text-zinc-900/70'
                              : 'text-muted-foreground'
                          )}
                        >
                          {team.role}
                        </p>
                      </div>
                      {selectedTeam?.id === team.id && <Check className="h-4 w-4 flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Stats */}
            {selectedTeam && !isMembersLoading && (
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
                <p className="text-sm font-medium text-muted-foreground mb-4">Team Stats</p>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Members</span>
                    <span className="text-sm font-medium">{members.length}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Pending</span>
                    <span className="text-sm font-medium">{pendingInvitations.length}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Your role</span>
                    <Badge variant={getRoleBadgeVariant(myRole)} className="text-xs capitalize">
                      {myRole}
                    </Badge>
                  </div>
                </div>
              </div>
            )}
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            {!selectedTeam ? (
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-12 text-center">
                <Building2 className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
                <h2 className="text-xl font-semibold mb-2">No team selected</h2>
                <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                  Create a team to start collaborating with others on presentations.
                </p>
                <Button onClick={() => setShowCreateTeamDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create your first team
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Team Header */}
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-14 w-14 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-lg font-semibold">
                        {selectedTeam.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h1 className="text-xl font-semibold">{selectedTeam.name}</h1>
                        <p className="text-sm text-muted-foreground">
                          {members.length} member{members.length !== 1 ? 's' : ''}
                          {pendingInvitations.length > 0 &&
                            ` · ${pendingInvitations.length} pending`}
                        </p>
                      </div>
                    </div>

                    {isOwner && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setEditTeamName(selectedTeam.name);
                              setShowEditTeamDialog(true);
                            }}
                          >
                            <Pencil className="h-4 w-4 mr-2" />
                            Rename team
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setShowDeleteTeamDialog(true)}
                            className="text-red-600 dark:text-red-400"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete team
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>

                {/* Invite Members */}
                {canManageMembers && (
                  <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
                    <h2 className="text-lg font-semibold mb-1">Invite Members</h2>
                    <p className="text-sm text-muted-foreground mb-4">
                      Add team members by email. They'll receive an invitation to join.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="flex-1">
                        <Input
                          type="email"
                          placeholder="colleague@company.com"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && inviteEmail.trim()) {
                              handleInviteMember();
                            }
                          }}
                        />
                      </div>
                      <Select
                        value={inviteRole}
                        onValueChange={(v) => setInviteRole(v as 'admin' | 'member')}
                      >
                        <SelectTrigger className="w-full sm:w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">Member</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        onClick={handleInviteMember}
                        disabled={!inviteEmail.trim() || isAddingMember}
                      >
                        {isAddingMember ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <UserPlus className="h-4 w-4 mr-2" />
                            Invite
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Members List */}
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
                  <div className="p-6 border-b border-zinc-200 dark:border-zinc-800">
                    <h2 className="text-lg font-semibold">Members</h2>
                  </div>

                  {isMembersLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : members.length === 0 ? (
                    <div className="p-6 text-center text-muted-foreground">
                      <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
                      <p>No members yet</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                      {members.map((member) => {
                        const isSelf = member.user_id === selfUserId;
                        const canEditMember =
                          canManageMembers && !isSelf && member.role !== 'owner';
                        const canRemoveMember =
                          canManageMembers && !isSelf && !(member.role === 'owner' && !isOwner);

                        return (
                          <div
                            key={member.user_id}
                            className="flex items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <Avatar className="h-10 w-10">
                                <AvatarFallback className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-sm font-medium">
                                  {getInitials(member.email, member.full_name)}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">
                                    {member.full_name || member.email}
                                  </span>
                                  {isSelf && (
                                    <Badge variant="outline" className="text-xs">
                                      You
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">{member.email}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {canEditMember ? (
                                <Select
                                  value={member.role}
                                  onValueChange={(v) =>
                                    handleUpdateRole(member, v as TeamRole)
                                  }
                                >
                                  <SelectTrigger className="w-[120px] h-9">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="member">Member</SelectItem>
                                    <SelectItem value="admin">Admin</SelectItem>
                                    {isOwner && <SelectItem value="owner">Owner</SelectItem>}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Badge
                                  variant={getRoleBadgeVariant(member.role)}
                                  className="gap-1 capitalize"
                                >
                                  <RoleIcon role={member.role} />
                                  {member.role}
                                </Badge>
                              )}

                              {canRemoveMember && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 text-muted-foreground hover:text-red-600"
                                  onClick={() => setMemberToRemove(member)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Pending Invitations */}
                {pendingInvitations.length > 0 && (
                  <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <div className="p-6 border-b border-zinc-200 dark:border-zinc-800">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <h2 className="text-lg font-semibold">Pending Invitations</h2>
                      </div>
                    </div>

                    <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                      {pendingInvitations.map((inv) => (
                        <div
                          key={inv.id}
                          className="flex items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                              <Mail className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{inv.email}</p>
                              <p className="text-xs text-muted-foreground">
                                Expires{' '}
                                {new Date(inv.expires_at).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="capitalize">
                              {inv.role}
                            </Badge>
                            {inv.token && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9"
                                onClick={() => copyInviteLink(inv.token)}
                                title="Copy invite link"
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 text-muted-foreground hover:text-red-600"
                              onClick={() => handleCancelInvitation(inv)}
                              title="Cancel invitation"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Role Permissions Info */}
                <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
                  <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    Role Permissions
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Crown className="h-4 w-4 text-amber-500" />
                        <span className="font-medium text-sm">Owner</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Full access. Can delete team, manage billing, and transfer ownership.
                      </p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-blue-500" />
                        <span className="font-medium text-sm">Admin</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Can invite members, manage roles, and access all team presentations.
                      </p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-zinc-500" />
                        <span className="font-medium text-sm">Member</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Can view and edit presentations shared with the team.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Create Team Dialog */}
      <Dialog open={showCreateTeamDialog} onOpenChange={setShowCreateTeamDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a new team</DialogTitle>
            <DialogDescription>
              Teams let you collaborate on presentations with others.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="teamName">Team name</Label>
            <Input
              id="teamName"
              placeholder="e.g. Marketing, Sales, Product..."
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newTeamName.trim()) {
                  handleCreateTeam();
                }
              }}
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateTeamDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateTeam} disabled={!newTeamName.trim() || isCreatingTeam}>
              {isCreatingTeam ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Create team'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Team Dialog */}
      <Dialog open={showEditTeamDialog} onOpenChange={setShowEditTeamDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename team</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="editTeamName">Team name</Label>
            <Input
              id="editTeamName"
              value={editTeamName}
              onChange={(e) => setEditTeamName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && editTeamName.trim()) {
                  handleUpdateTeam();
                }
              }}
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditTeamDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateTeam} disabled={!editTeamName.trim() || isUpdatingTeam}>
              {isUpdatingTeam ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Team Dialog */}
      <AlertDialog open={showDeleteTeamDialog} onOpenChange={setShowDeleteTeamDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete team?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{selectedTeam?.name}" and remove all members. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTeam}
              className="bg-red-600 hover:bg-red-700"
              disabled={isDeletingTeam}
            >
              {isDeletingTeam ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete team'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove Member Dialog */}
      <AlertDialog open={!!memberToRemove} onOpenChange={() => setMemberToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {memberToRemove?.email} from the team? They will lose
              access to all team presentations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveMember}
              className="bg-red-600 hover:bg-red-700"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TeamSettings;
