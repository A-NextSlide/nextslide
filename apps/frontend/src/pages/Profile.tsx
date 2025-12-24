import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/SupabaseAuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  User,
  Mail,
  Lock,
  LogOut,
  Building,
  Bell,
  Shield,
  CreditCard,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Link2,
  ChevronRight,
  Settings,
  Zap,
  ExternalLink,
  Eye,
  EyeOff,
  Code,
  Copy,
  Check,
  Plus,
  Trash2,
  RefreshCw,
  Key,
  Users,
  Crown,
  MoreHorizontal,
  UserPlus,
  X,
  Building2,
  Clock,
  Pencil
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { googleIntegrationApi } from '@/services/googleIntegrationApi';
import { billingApi, type CreditBalance, type Subscription, type UsageStats } from '@/services/billingApi';
import { developerApiService, type ApiKey, type CreateApiKeyResponse } from '@/services/developerApiService';
import { WelcomeModal } from '@/components/billing/WelcomeModal';
import { CancellationModal } from '@/components/billing/CancellationModal';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { teamsApi, Team, TeamMember } from '@/services/teamsApi';

type SettingsTab = 'profile' | 'security' | 'notifications' | 'billing' | 'integrations' | 'api' | 'team';

type TeamRole = 'owner' | 'admin' | 'member';

interface PendingInvitation {
  id: string;
  email: string;
  role: TeamRole;
  created_at: string;
  expires_at: string;
  token: string;
}

const Profile: React.FC = () => {
  const { user, signOut, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Get active tab from URL or default to 'profile'
  const activeTab = (searchParams.get('tab') as SettingsTab) || 'profile';

  const setActiveTab = (tab: SettingsTab) => {
    setSearchParams({ tab });
  };

  // Form states
  const [profileData, setProfileData] = useState({
    full_name: '',
    company: ''
  });
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Loading states
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // Validation states
  const [profileChanged, setProfileChanged] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // Billing states
  const [billingBalance, setBillingBalance] = useState<CreditBalance | null>(null);
  const [billingSubscription, setBillingSubscription] = useState<Subscription | null>(null);
  const [billingUsage, setBillingUsage] = useState<UsageStats | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [welcomeModal, setWelcomeModal] = useState<{ show: boolean; planName: string; credits: number; isFriendsFamily?: boolean }>({
    show: false,
    planName: '',
    credits: 0,
    isFriendsFamily: false
  });

  // API Key states
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [apiKeysLoading, setApiKeysLoading] = useState(false);
  const [showCreateKeyDialog, setShowCreateKeyDialog] = useState(false);
  const [showEditKeyDialog, setShowEditKeyDialog] = useState(false);
  const [selectedKey, setSelectedKey] = useState<ApiKey | null>(null);
  const [newKeyData, setNewKeyData] = useState<CreateApiKeyResponse | null>(null);
  const [newKeyForm, setNewKeyForm] = useState({
    name: '',
    context_instructions: '',
    webhook_url: '',
    include_edit_link: false
  });
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [creatingKey, setCreatingKey] = useState(false);
  const [deletingKeyId, setDeletingKeyId] = useState<string | null>(null);

  // Team states
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
  const [isTeamsLoading, setIsTeamsLoading] = useState(true);
  const [isMembersLoading, setIsMembersLoading] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [isDeletingTeam, setIsDeletingTeam] = useState(false);
  const [isUpdatingTeam, setIsUpdatingTeam] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [newTeamName, setNewTeamName] = useState('');
  const [editTeamName, setEditTeamName] = useState('');
  const [showCreateTeamDialog, setShowCreateTeamDialog] = useState(false);
  const [showDeleteTeamDialog, setShowDeleteTeamDialog] = useState(false);
  const [showEditTeamDialog, setShowEditTeamDialog] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);

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

  // Initialize form with user data
  useEffect(() => {
    if (user) {
      setProfileData({
        full_name: user.user_metadata?.full_name || '',
        company: user.user_metadata?.company || ''
      });
    }
  }, [user]);

  // Check if profile data has changed
  useEffect(() => {
    if (user) {
      const hasChanged =
        profileData.full_name !== (user.user_metadata?.full_name || '') ||
        profileData.company !== (user.user_metadata?.company || '');
      setProfileChanged(hasChanged);
    }
  }, [profileData, user]);

  // Handle checkout success - sync subscription from Stripe
  useEffect(() => {
    const billingSuccess = searchParams.get('billing');
    const upgraded = searchParams.get('upgraded');

    // Handle upgrade success (prorated upgrade, no Stripe checkout)
    if (upgraded === 'true' && !authLoading && user) {
      const refreshBillingData = async () => {
        setBillingLoading(true);
        try {
          // Load fresh billing data after upgrade
          const [balance, subscription, usage] = await Promise.all([
            billingApi.getBalance(),
            billingApi.getSubscription(),
            billingApi.getUsageStats()
          ]);
          setBillingBalance(balance);
          setBillingSubscription(subscription);
          setBillingUsage(usage);

          // Show success toast
          toast({
            title: 'Plan upgraded!',
            description: `You're now on the ${subscription.plan_name} plan. The prorated difference will be charged to your card.`
          });
        } catch (err) {
          console.error('Failed to load billing data after upgrade:', err);
        } finally {
          setBillingLoading(false);
          // Clear the upgraded param from URL
          setSearchParams({ tab: 'billing' });
        }
      };
      refreshBillingData();
      return;
    }

    // Handle new subscription checkout success
    if (billingSuccess === 'success' && !authLoading && user) {
      const syncAndRefresh = async () => {
        setBillingLoading(true);
        let showedWelcome = false;

        // Retry sync up to 3 times with delay (Stripe may take a moment to activate subscription)
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            console.log(`[Billing] Sync attempt ${attempt}/3...`);
            const syncResult = await billingApi.syncSubscription();
            console.log('[Billing] Sync result:', syncResult);

            if (syncResult.synced && (syncResult.monthly_credits || syncResult.monthly_credits === -1)) {
              const isFF = syncResult.monthly_credits === -1;
              setWelcomeModal({
                show: true,
                planName: isFF ? 'Friends & Family' : (syncResult.plan_id === 'pro' ? 'Pro' : 'Starter'),
                credits: syncResult.monthly_credits,
                isFriendsFamily: isFF
              });
              showedWelcome = true;
              break; // Success, exit retry loop
            } else if (attempt < 3) {
              // Wait before retry (1s, 2s)
              console.log(`[Billing] Sync not ready, waiting ${attempt}s...`);
              await new Promise(resolve => setTimeout(resolve, attempt * 1000));
            }
          } catch (err) {
            console.error(`[Billing] Sync attempt ${attempt} failed:`, err);
            if (attempt < 3) {
              await new Promise(resolve => setTimeout(resolve, attempt * 1000));
            }
          }
        }

        try {
          // Load fresh billing data
          const [balance, subscription, usage] = await Promise.all([
            billingApi.getBalance(),
            billingApi.getSubscription(),
            billingApi.getUsageStats()
          ]);
          setBillingBalance(balance);
          setBillingSubscription(subscription);
          setBillingUsage(usage);

          // If sync didn't show welcome, try using fetched data
          if (!showedWelcome && subscription.plan_id !== 'free') {
            const isFF = balance.is_friends_family || balance.monthly_credits === -1;
            setWelcomeModal({
              show: true,
              planName: isFF ? 'Friends & Family' : subscription.plan_name,
              credits: balance.monthly_credits,
              isFriendsFamily: isFF
            });
          }
        } catch (err) {
          console.error('Failed to load billing data:', err);
        } finally {
          setBillingLoading(false);
          // Clear the billing param from URL
          setSearchParams({ tab: 'billing' });
        }
      };
      syncAndRefresh();
    }
  }, [searchParams, authLoading, user, setSearchParams]);

  // Load billing data when auth is ready
  useEffect(() => {
    // Skip if we're handling checkout success or upgrade
    if (searchParams.get('billing') === 'success') return;
    if (searchParams.get('upgraded') === 'true') return;

    // If still loading auth or no user, keep loading state but don't fetch
    if (authLoading) return;
    if (!user) {
      setBillingLoading(false);
      return;
    }

    const loadBillingData = async () => {
      setBillingLoading(true);
      try {
        console.log('[Profile] Loading billing data...');
        // Load each independently to avoid one failure blocking all
        const [balanceResult, subscriptionResult, usageResult] = await Promise.allSettled([
          billingApi.getBalance(),
          billingApi.getSubscription(),
          billingApi.getUsageStats()
        ]);

        if (balanceResult.status === 'fulfilled') {
          console.log('[Profile] Balance loaded:', balanceResult.value);
          setBillingBalance(balanceResult.value);
        } else {
          console.error('[Profile] Balance failed:', balanceResult.reason);
        }

        if (subscriptionResult.status === 'fulfilled') {
          console.log('[Profile] Subscription loaded:', subscriptionResult.value);
          setBillingSubscription(subscriptionResult.value);
        } else {
          console.error('[Profile] Subscription failed:', subscriptionResult.reason);
        }

        if (usageResult.status === 'fulfilled') {
          console.log('[Profile] Usage loaded:', usageResult.value);
          setBillingUsage(usageResult.value);
        } else {
          console.error('[Profile] Usage failed:', usageResult.reason);
        }
      } catch (err) {
        console.error('[Profile] Failed to load billing data:', err);
      } finally {
        setBillingLoading(false);
      }
    };
    loadBillingData();
  }, [authLoading, user, searchParams]);

  // Handle manage billing click
  const handleManageBilling = async () => {
    // Free users don't have a Stripe account - redirect to pricing
    const currentPlanId = billingSubscription?.plan_id || billingBalance?.plan_id;
    if (currentPlanId === 'free' || !currentPlanId) {
      navigate('/pricing?from=settings');
      return;
    }

    setPortalLoading(true);
    try {
      const session = await billingApi.createPortalSession();
      window.location.href = session.url;
    } catch (err: any) {
      // If no Stripe customer, prompt to upgrade
      if (err?.response?.status === 400) {
        toast({
          title: 'No billing account',
          description: 'Subscribe to a paid plan to manage billing.',
        });
        navigate('/pricing?from=settings');
        return;
      }
      toast({
        title: 'Error',
        description: 'Failed to open billing portal. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setPortalLoading(false);
    }
  };

  // Handle cancel subscription
  const handleCancelSubscription = async (reason: string, details: string) => {
    try {
      await billingApi.cancelSubscription(reason, details);
      // Refresh billing data
      const [balance, subscription] = await Promise.all([
        billingApi.getBalance(),
        billingApi.getSubscription()
      ]);
      setBillingBalance(balance);
      setBillingSubscription(subscription);
      setShowCancelConfirm(false);
      toast({
        title: 'Subscription canceled',
        description: 'Your subscription will remain active until the end of your billing period.',
      });
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to cancel subscription. Please try again.',
        variant: 'destructive'
      });
      throw err; // Re-throw so modal knows it failed
    }
  };

  // Get initials for avatar
  const getInitials = (name?: string) => {
    if (!name) {
      return user?.email ? user.email[0].toUpperCase() : 'U';
    }
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return parts[0][0].toUpperCase() + parts[parts.length - 1][0].toUpperCase();
    }
    return name[0].toUpperCase();
  };

  // Handle profile update - now functional with Supabase
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingProfile(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: profileData.full_name,
          company: profileData.company
        }
      });

      if (error) throw error;

      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully.",
      });
      setProfileChanged(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: error.message || "Failed to update profile",
      });
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  // Handle password update
  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }

    setPasswordError('');
    setIsUpdatingPassword(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      toast({
        title: "Password updated",
        description: "Your password has been changed successfully.",
      });
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: error.message || "Failed to update password",
      });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  // Handle sign out
  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      // Error handled by context
    }
  };

  // API Key handlers
  const loadApiKeys = async () => {
    if (!user) return;
    setApiKeysLoading(true);
    try {
      const keys = await developerApiService.listApiKeys();
      setApiKeys(keys);
    } catch (error: any) {
      // Only show error if not a Pro subscription issue
      if (!error.message?.includes('Pro subscription')) {
        toast({
          variant: "destructive",
          title: "Error loading API keys",
          description: error.message
        });
      }
    } finally {
      setApiKeysLoading(false);
    }
  };

  // Load API keys when tab is active
  useEffect(() => {
    if (activeTab === 'api' && user && !authLoading) {
      loadApiKeys();
    }
  }, [activeTab, user, authLoading]);

  const handleCreateApiKey = async () => {
    setCreatingKey(true);
    try {
      const response = await developerApiService.createKey({
        name: newKeyForm.name || 'Default',
        context_instructions: newKeyForm.context_instructions || null,
        webhook_url: newKeyForm.webhook_url || null,
        include_edit_link: newKeyForm.include_edit_link
      });
      setNewKeyData(response);
      await loadApiKeys();
      toast({
        title: "API key created",
        description: "Copy your key now - it won't be shown again!"
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to create API key",
        description: error.message
      });
      setShowCreateKeyDialog(false);
    } finally {
      setCreatingKey(false);
    }
  };

  const handleDeleteApiKey = async (keyId: string) => {
    setDeletingKeyId(keyId);
    try {
      await developerApiService.deleteKey(keyId);
      await loadApiKeys();
      toast({
        title: "API key deleted",
        description: "The API key has been permanently deleted."
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to delete API key",
        description: error.message
      });
    } finally {
      setDeletingKeyId(null);
    }
  };

  const handleCopyApiKey = async (key: string, keyId?: string) => {
    try {
      await navigator.clipboard.writeText(key);
      if (keyId) {
        setCopiedKeyId(keyId);
        setTimeout(() => setCopiedKeyId(null), 2000);
      }
      toast({
        title: "Copied",
        description: "API key copied to clipboard"
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Copy failed",
        description: "Failed to copy to clipboard"
      });
    }
  };

  const handleUpdateApiKey = async (keyId: string, updates: Partial<ApiKey>) => {
    try {
      await developerApiService.updateKey(keyId, updates);
      await loadApiKeys();
      setShowEditKeyDialog(false);
      setSelectedKey(null);
      toast({
        title: "API key updated",
        description: "Settings have been saved."
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to update API key",
        description: error.message
      });
    }
  };

  const resetCreateKeyForm = () => {
    setNewKeyForm({
      name: '',
      context_instructions: '',
      webhook_url: '',
      include_edit_link: false
    });
    setNewKeyData(null);
    setShowCreateKeyDialog(false);
  };

  const currentPlan = billingSubscription?.plan_id || billingBalance?.plan_id;
  const isPro = currentPlan === 'pro' || currentPlan === 'enterprise' || billingBalance?.is_friends_family;

  // Team-related computed values
  const selfUserId = user?.id;
  const myTeamRole = teamMembers.find((m) => m.user_id === selfUserId)?.role || 'member';
  const canManageMembers = myTeamRole === 'owner' || myTeamRole === 'admin';
  const isTeamOwner = myTeamRole === 'owner';

  // Load teams
  const loadTeams = useCallback(async () => {
    setIsTeamsLoading(true);
    try {
      const teamsList = await teamsApi.listTeams();
      setTeams(teamsList);
      if (teamsList.length > 0 && !selectedTeam) {
        setSelectedTeam(teamsList[0]);
      }
    } catch (error) {
      console.error('Failed to load teams:', error);
    } finally {
      setIsTeamsLoading(false);
    }
  }, [selectedTeam]);

  // Load members when team changes
  const loadTeamMembers = useCallback(async () => {
    if (!selectedTeam) {
      setTeamMembers([]);
      return;
    }
    setIsMembersLoading(true);
    try {
      const membersList = await teamsApi.listMembers(selectedTeam.id);
      setTeamMembers(membersList);

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

  // Load teams when tab is active
  useEffect(() => {
    if (activeTab === 'team' && user && !authLoading) {
      loadTeams();
    }
  }, [activeTab, user, authLoading, loadTeams]);

  // Load members when team changes
  useEffect(() => {
    if (activeTab === 'team') {
      loadTeamMembers();
    }
  }, [activeTab, selectedTeam, loadTeamMembers]);

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

    if (teamMembers.some((m) => m.email?.toLowerCase() === email)) {
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
        toast({
          title: 'Member added',
          description: `${email} has been added to the team.`,
        });
        loadTeamMembers();
      } else if (result.invitation_id) {
        toast({
          title: 'Invitation sent',
          description: `An invitation has been sent to ${email}.`,
        });
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
  const handleUpdateMemberRole = async (member: TeamMember, newRole: TeamRole) => {
    if (!selectedTeam || member.role === newRole) return;

    if (member.user_id === selfUserId && member.role === 'owner') {
      const ownerCount = teamMembers.filter((m) => m.role === 'owner').length;
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
      setTeamMembers((prev) =>
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

    if (memberToRemove.role === 'owner') {
      const ownerCount = teamMembers.filter((m) => m.role === 'owner').length;
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
      setTeamMembers((prev) => prev.filter((m) => m.user_id !== memberToRemove.user_id));
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

  // Get team member initials
  const getTeamMemberInitials = (email: string, name?: string) => {
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

  // Role icon component
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

  const navItems = [
    { id: 'profile' as const, label: 'Profile', icon: User },
    { id: 'security' as const, label: 'Security', icon: Shield },
    { id: 'billing' as const, label: 'Billing', icon: CreditCard },
    { id: 'team' as const, label: 'Team', icon: Users },
    { id: 'integrations' as const, label: 'Integrations', icon: Link2 },
    { id: 'api' as const, label: 'Developer API', icon: Code },
    { id: 'notifications' as const, label: 'Notifications', icon: Bell },
  ];

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
              <Settings className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Settings</span>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="gap-2 text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar */}
          <aside className="lg:w-64 flex-shrink-0">
            {/* User Card */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 mb-6">
              <div className="flex items-center gap-4">
                <Avatar className="h-12 w-12">
                  <AvatarFallback className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium">
                    {getInitials(user?.user_metadata?.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">
                    {user?.user_metadata?.full_name || 'Set your name'}
                  </p>
                  <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
                </div>
              </div>

              <Separator className="my-4" />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plan</span>
                  {billingLoading ? (
                    <div className="flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Loading...</span>
                    </div>
                  ) : (
                    <Badge variant="secondary" className="font-normal">
                      {billingSubscription?.plan_name || billingBalance?.plan_name || 'Free'}
                    </Badge>
                  )}
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Member since</span>
                  <span>
                    {user?.created_at ? new Date(user.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      year: 'numeric'
                    }) : '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* Navigation */}
            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors",
                      isActive
                        ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                        : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                    {isActive && <ChevronRight className="h-4 w-4 ml-auto" />}
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
              {/* Profile Tab */}
              {activeTab === 'profile' && (
                <div className="p-6 lg:p-8">
                  <div className="mb-8">
                    <h2 className="text-xl font-semibold mb-1">Profile</h2>
                    <p className="text-sm text-muted-foreground">
                      Manage your personal information
                    </p>
                  </div>

                  <form onSubmit={handleUpdateProfile} className="space-y-6 max-w-md">
                    <div className="space-y-2">
                      <Label htmlFor="fullName">Full name</Label>
                      <Input
                        id="fullName"
                        placeholder="Enter your full name"
                        value={profileData.full_name}
                        onChange={(e) => setProfileData(prev => ({ ...prev, full_name: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={user?.email || ''}
                        disabled
                        className="bg-zinc-50 dark:bg-zinc-800"
                      />
                      <p className="text-xs text-muted-foreground">
                        Contact support to change your email address
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="company">Company</Label>
                      <Input
                        id="company"
                        placeholder="Enter your company name"
                        value={profileData.company}
                        onChange={(e) => setProfileData(prev => ({ ...prev, company: e.target.value }))}
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={!profileChanged || isUpdatingProfile}
                    >
                      {isUpdatingProfile ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        'Save changes'
                      )}
                    </Button>
                  </form>
                </div>
              )}

              {/* Security Tab */}
              {activeTab === 'security' && (
                <div className="p-6 lg:p-8">
                  <div className="mb-8">
                    <h2 className="text-xl font-semibold mb-1">Security</h2>
                    <p className="text-sm text-muted-foreground">
                      Manage your password and security settings
                    </p>
                  </div>

                  <form onSubmit={handlePasswordUpdate} className="space-y-6 max-w-md">
                    <div className="space-y-2">
                      <Label htmlFor="newPassword">New password</Label>
                      <div className="relative">
                        <Input
                          id="newPassword"
                          type={showPassword ? "text" : "password"}
                          placeholder="Enter new password"
                          value={newPassword}
                          onChange={(e) => {
                            setNewPassword(e.target.value);
                            setPasswordError('');
                          }}
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirm password</Label>
                      <Input
                        id="confirmPassword"
                        type={showPassword ? "text" : "password"}
                        placeholder="Confirm new password"
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          setPasswordError('');
                        }}
                      />
                    </div>

                    {passwordError && (
                      <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                        <AlertCircle className="h-4 w-4" />
                        {passwordError}
                      </div>
                    )}

                    <Button
                      type="submit"
                      disabled={!newPassword || !confirmPassword || isUpdatingPassword}
                    >
                      {isUpdatingPassword ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Updating...
                        </>
                      ) : (
                        'Update password'
                      )}
                    </Button>
                  </form>

                  <Separator className="my-8" />

                  <div className="max-w-md">
                    <h3 className="font-medium mb-4">Two-factor authentication</h3>
                    <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center">
                          <Shield className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">2FA is not enabled</p>
                          <p className="text-xs text-muted-foreground">
                            Add extra security to your account
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline">Coming soon</Badge>
                    </div>
                  </div>
                </div>
              )}

              {/* Billing Tab */}
              {activeTab === 'billing' && (
                <div className="p-6 lg:p-8">
                  <div className="mb-8">
                    <h2 className="text-xl font-semibold mb-1">Billing & Subscription</h2>
                    <p className="text-sm text-muted-foreground">
                      Manage your subscription and credits
                    </p>
                  </div>

                  {billingLoading ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="space-y-8">
                      {/* Current Plan Card */}
                      <div className="p-6 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
                        <div className="flex items-center justify-between mb-6">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-sm text-muted-foreground">Current plan</p>
                              <Badge variant="secondary" className="text-xs font-normal">
                                {billingSubscription?.status === 'active' ? 'Active' : billingSubscription?.status || 'Active'}
                              </Badge>
                            </div>
                            <h3 className="text-xl font-semibold">
                              {billingSubscription?.plan_name || billingBalance?.plan_name || 'Free'}
                            </h3>
                          </div>

                          {(billingSubscription?.plan_id || billingBalance?.plan_id) === 'free' ? (
                            <Button
                              onClick={() => navigate('/pricing?from=settings')}
                            >
                              Upgrade
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              onClick={handleManageBilling}
                              disabled={portalLoading}
                            >
                              {portalLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                'Manage'
                              )}
                            </Button>
                          )}
                        </div>

                        {/* Credits Progress */}
                        {billingBalance && (
                          <div className="space-y-3">
                            {/* Friends & Family Special Display */}
                            {billingBalance.is_friends_family ? (
                              <div className="relative">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="text-sm text-muted-foreground mb-1">Credits</p>
                                    <p className="text-4xl font-bold bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent">
                                      ∞
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gradient-to-r from-pink-100 to-purple-100 dark:from-pink-900/30 dark:to-purple-900/30 text-sm font-medium text-purple-700 dark:text-purple-300">
                                      <span className="text-lg">💜</span> Friends & Family
                                    </span>
                                  </div>
                                </div>

                                {/* Fun message card */}
                                <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-pink-50 via-purple-50 to-indigo-50 dark:from-pink-900/20 dark:via-purple-900/20 dark:to-indigo-900/20 border border-purple-200 dark:border-purple-800">
                                  <div className="flex items-center gap-3">
                                    <div className="text-3xl animate-bounce">🎉</div>
                                    <div>
                                      <p className="font-bold text-purple-900 dark:text-purple-100" style={{ fontFamily: '"Comic Sans MS", cursive, sans-serif' }}>
                                        Wow! Ahmed must really love you!
                                      </p>
                                      <p className="text-sm text-purple-600 dark:text-purple-400 mt-1">
                                        You have unlimited credits forever. Go wild! 🚀
                                      </p>
                                    </div>
                                    <div className="text-3xl animate-bounce" style={{ animationDelay: '0.1s' }}>✨</div>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-end justify-between">
                                  <div>
                                    <p className="text-sm text-muted-foreground mb-1">Credits</p>
                                    <p className="text-2xl font-medium tabular-nums">
                                      {billingBalance.remaining_credits}
                                      <span className="text-base text-muted-foreground font-normal">
                                        {' '}/ {billingBalance.monthly_credits + billingBalance.purchased_credits}
                                      </span>
                                      {billingBalance.purchased_credits > 0 && (
                                        <span className="ml-2 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
                                          +{billingBalance.purchased_credits} bonus
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                  {billingBalance.period_end && (
                                    <p className="text-sm text-muted-foreground">
                                      Resets {new Date(billingBalance.period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </p>
                                  )}
                                </div>

                                <div className="h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-zinc-900 dark:bg-zinc-300 rounded-full transition-all duration-500"
                                    style={{
                                      width: `${Math.min(100, (billingBalance.remaining_credits / (billingBalance.monthly_credits + billingBalance.purchased_credits)) * 100)}%`
                                    }}
                                  />
                                </div>

                                {/* Overage availability for Pro (when no overages yet) */}
                                {billingBalance.can_use_overage && billingBalance.overage_credits === 0 && (
                                  <p className="text-sm text-muted-foreground">
                                    Pro plan: Additional credits available at $0.03 each
                                  </p>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Overage Charges Section - for Pro users with overages */}
                      {billingBalance?.can_use_overage && billingBalance.overage_credits > 0 && (
                        <div className="p-6 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="text-sm font-medium text-amber-900 dark:text-amber-100">Overage Charges</h3>
                                <Badge variant="outline" className="text-xs font-normal border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300">
                                  Pro
                                </Badge>
                              </div>
                              <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">
                                You've used {billingBalance.overage_credits} credits beyond your monthly allowance
                              </p>
                              <div className="flex items-baseline gap-1">
                                <span className="text-2xl font-semibold text-amber-900 dark:text-amber-100">
                                  ${(billingBalance.overage_cost_cents / 100).toFixed(2)}
                                </span>
                                <span className="text-sm text-amber-600 dark:text-amber-400">
                                  on next invoice
                                </span>
                              </div>
                              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                {billingBalance.overage_credits} credits × $0.03 per credit
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleManageBilling}
                              disabled={portalLoading}
                              className="border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                            >
                              {portalLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                'View invoice'
                              )}
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Upgrade prompt for free users (but not F&F) */}
                      {(billingSubscription?.plan_id || billingBalance?.plan_id) === 'free' && !billingBalance?.is_friends_family && (
                        <div className="p-4 bg-gradient-to-r from-zinc-100 to-zinc-50 dark:from-zinc-800/50 dark:to-zinc-800/30 rounded-lg border border-zinc-200 dark:border-zinc-700">
                          <div className="flex items-start gap-3">
                            <Zap className="h-5 w-5 text-amber-500 mt-0.5" />
                            <div className="flex-1">
                              <p className="font-medium text-sm mb-1">Upgrade for more credits</p>
                              <p className="text-sm text-muted-foreground">
                                Get up to 2,000 credits/month with Pro, plus priority support and unlimited presentations.
                              </p>
                            </div>
                            <Button size="sm" onClick={() => navigate('/pricing?from=settings')}>
                              View plans
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Usage Stats */}
                      {billingUsage && (
                        <div>
                          <h3 className="text-sm font-medium text-muted-foreground mb-4">
                            Usage this period
                          </h3>
                          <div className="grid grid-cols-3 gap-4">
                            <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg text-center">
                              <p className="text-xl font-medium tabular-nums">
                                {billingUsage.slides_generated}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">Slides</p>
                            </div>
                            <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg text-center">
                              <p className="text-xl font-medium tabular-nums">
                                {billingUsage.chats_sent}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">Chats</p>
                            </div>
                            <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg text-center">
                              <p className="text-xl font-medium tabular-nums">
                                {billingUsage.edits_made}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">Edits</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Cancellation notice */}
                      {billingSubscription?.cancel_at_period_end && billingSubscription?.current_period_end && (
                        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                          <div className="flex items-start gap-3">
                            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                            <div>
                              <p className="font-medium text-sm text-amber-900 dark:text-amber-100">
                                Subscription canceling
                              </p>
                              <p className="text-sm text-amber-700 dark:text-amber-300">
                                Your access continues until {new Date(billingSubscription.current_period_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}. After that, you'll be downgraded to the Free plan.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      <Separator />

                      {/* Actions */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate('/pricing?from=settings')}
                          >
                            View plans
                          </Button>
                          {(billingSubscription?.plan_id || billingBalance?.plan_id) !== 'free' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleManageBilling}
                              disabled={portalLoading}
                            >
                              {portalLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                'Billing history'
                              )}
                            </Button>
                          )}
                        </div>

                        {/* Cancel subscription */}
                        {(billingSubscription?.plan_id || billingBalance?.plan_id) !== 'free' && !billingSubscription?.cancel_at_period_end && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowCancelConfirm(true)}
                            className="text-muted-foreground hover:text-red-600"
                          >
                            Cancel plan
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Integrations Tab */}
              {activeTab === 'integrations' && (
                <div className="p-6 lg:p-8">
                  <div className="mb-8">
                    <h2 className="text-xl font-semibold mb-1">Integrations</h2>
                    <p className="text-sm text-muted-foreground">
                      Connect third-party services
                    </p>
                  </div>

                  <div className="space-y-4 max-w-lg">
                    <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center">
                          <svg className="h-5 w-5" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                          </svg>
                        </div>
                        <div>
                          <p className="font-medium text-sm">Google Drive</p>
                          <p className="text-xs text-muted-foreground">Import and export slides</p>
                        </div>
                      </div>
                      <GoogleIntegrationButton />
                    </div>
                  </div>
                </div>
              )}

              {/* Notifications Tab */}
              {activeTab === 'notifications' && (
                <div className="p-6 lg:p-8">
                  <div className="mb-8">
                    <h2 className="text-xl font-semibold mb-1">Notifications</h2>
                    <p className="text-sm text-muted-foreground">
                      Choose what updates you receive
                    </p>
                  </div>

                  <div className="space-y-6 max-w-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">Email notifications</p>
                        <p className="text-xs text-muted-foreground">
                          Receive updates about your presentations
                        </p>
                      </div>
                      <Switch disabled />
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">Product updates</p>
                        <p className="text-xs text-muted-foreground">
                          Stay informed about new features
                        </p>
                      </div>
                      <Switch disabled />
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">Collaboration alerts</p>
                        <p className="text-xs text-muted-foreground">
                          Get notified when someone shares with you
                        </p>
                      </div>
                      <Switch disabled />
                    </div>

                    <p className="text-sm text-muted-foreground pt-4">
                      Notification preferences coming soon
                    </p>
                  </div>
                </div>
              )}

              {/* Developer API Tab */}
              {activeTab === 'api' && (
                <div className="p-6 lg:p-8">
                  <div className="mb-8">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-xl font-semibold mb-1">Developer API</h2>
                        <p className="text-sm text-muted-foreground">
                          Build integrations with the NextSlide API
                        </p>
                      </div>
                      {isPro && (
                        <Button onClick={() => navigate('/developers')} variant="outline" size="sm">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          View Docs
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Pro-only gate */}
                  {!isPro ? (
                    <div className="max-w-lg">
                      <div className="p-6 bg-gradient-to-r from-zinc-100 to-zinc-50 dark:from-zinc-800/50 dark:to-zinc-800/30 rounded-xl border border-zinc-200 dark:border-zinc-700">
                        <div className="flex items-start gap-4">
                          <div className="h-12 w-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                            <Code className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold mb-1">Developer API</h3>
                            <p className="text-sm text-muted-foreground mb-4">
                              Create presentations programmatically with our REST API.
                              Available on Pro plans.
                            </p>
                            <ul className="text-sm text-muted-foreground space-y-1 mb-4">
                              <li className="flex items-center gap-2">
                                <Check className="h-4 w-4 text-green-500" />
                                Generate decks with a simple API call
                              </li>
                              <li className="flex items-center gap-2">
                                <Check className="h-4 w-4 text-green-500" />
                                Custom context and brand instructions
                              </li>
                              <li className="flex items-center gap-2">
                                <Check className="h-4 w-4 text-green-500" />
                                Webhook notifications on completion
                              </li>
                            </ul>
                            <Button onClick={() => navigate('/pricing?from=api')}>
                              <Zap className="h-4 w-4 mr-2" />
                              Upgrade to Pro
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6 max-w-2xl">
                      {/* API Keys List */}
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium">API Keys</h3>
                        <Button onClick={() => setShowCreateKeyDialog(true)} size="sm">
                          <Plus className="h-4 w-4 mr-2" />
                          Create Key
                        </Button>
                      </div>

                      {apiKeysLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : apiKeys.length === 0 ? (
                        <div className="p-8 text-center bg-zinc-50 dark:bg-zinc-800/50 rounded-lg border border-dashed border-zinc-200 dark:border-zinc-700">
                          <Key className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                          <p className="text-sm font-medium mb-1">No API keys yet</p>
                          <p className="text-xs text-muted-foreground mb-4">
                            Create an API key to start building integrations
                          </p>
                          <Button onClick={() => setShowCreateKeyDialog(true)} size="sm">
                            <Plus className="h-4 w-4 mr-2" />
                            Create your first key
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {apiKeys.map((key) => (
                            <div
                              key={key.id}
                              className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg border border-zinc-200 dark:border-zinc-700"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <p className="font-medium text-sm">{key.name}</p>
                                    {!key.is_active && (
                                      <Badge variant="secondary" className="text-xs">Revoked</Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <code className="text-xs bg-zinc-100 dark:bg-zinc-900 px-2 py-1 rounded font-mono text-zinc-600 dark:text-zinc-400">
                                      {key.key_prefix}<span className="text-zinc-400 dark:text-zinc-600">••••••••••••</span>
                                    </code>
                                  </div>
                                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                    <span>{key.request_count} requests</span>
                                    {key.last_used_at && (
                                      <span>Last used {new Date(key.last_used_at).toLocaleDateString()}</span>
                                    )}
                                    {key.webhook_url && (
                                      <span className="flex items-center gap-1">
                                        <RefreshCw className="h-3 w-3" />
                                        Webhook
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => {
                                      setSelectedKey(key);
                                      setShowEditKeyDialog(true);
                                    }}
                                  >
                                    <Settings className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                                    onClick={() => handleDeleteApiKey(key.id)}
                                    disabled={deletingKeyId === key.id}
                                  >
                                    {deletingKeyId === key.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-4 w-4" />
                                    )}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Quick Start Guide */}
                      <div className="mt-8 p-4 bg-zinc-900 dark:bg-zinc-950 rounded-lg">
                        <h4 className="text-sm font-medium text-white mb-3">Quick Start</h4>
                        <pre className="text-xs text-zinc-300 overflow-x-auto">
{`curl -X POST https://api.nextslide.ai/v1/decks \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"topic": "Q4 Sales Review", "slides": 10}'`}
                        </pre>
                        <Button
                          variant="link"
                          size="sm"
                          className="text-zinc-400 hover:text-white p-0 h-auto mt-2"
                          onClick={() => navigate('/developers')}
                        >
                          View full documentation
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Team Tab */}
              {activeTab === 'team' && (
                <div className="p-6 lg:p-8">
                  <div className="mb-8">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-xl font-semibold mb-1">Team</h2>
                        <p className="text-sm text-muted-foreground">
                          Manage your teams and collaborate with others
                        </p>
                      </div>
                      <Button size="sm" onClick={() => setShowCreateTeamDialog(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        New Team
                      </Button>
                    </div>
                  </div>

                  {isTeamsLoading ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : teams.length === 0 ? (
                    <div className="text-center py-12">
                      <Building2 className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No teams yet</h3>
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
                      {/* Team Selector */}
                      <div className="flex flex-wrap gap-2">
                        {teams.map((team) => (
                          <button
                            key={team.id}
                            onClick={() => setSelectedTeam(team)}
                            className={cn(
                              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                              selectedTeam?.id === team.id
                                ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                            )}
                          >
                            <div
                              className={cn(
                                'h-6 w-6 rounded flex items-center justify-center text-xs font-medium',
                                selectedTeam?.id === team.id
                                  ? 'bg-white/20 dark:bg-zinc-900/20'
                                  : 'bg-zinc-200 dark:bg-zinc-700'
                              )}
                            >
                              {team.name.substring(0, 2).toUpperCase()}
                            </div>
                            <span className="font-medium">{team.name}</span>
                            {selectedTeam?.id === team.id && <Check className="h-4 w-4" />}
                          </button>
                        ))}
                      </div>

                      {selectedTeam && (
                        <>
                          {/* Team Header */}
                          <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="h-12 w-12 rounded-xl bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-lg font-semibold">
                                  {selectedTeam.name.substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <h3 className="font-semibold">{selectedTeam.name}</h3>
                                  <p className="text-sm text-muted-foreground">
                                    {teamMembers.length} member{teamMembers.length !== 1 ? 's' : ''}
                                    {pendingInvitations.length > 0 && ` · ${pendingInvitations.length} pending`}
                                  </p>
                                </div>
                              </div>

                              {isTeamOwner && (
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
                            <div className="space-y-3">
                              <h3 className="text-sm font-medium">Invite Members</h3>
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
                          <div>
                            <h3 className="text-sm font-medium mb-3">Members</h3>
                            {isMembersLoading ? (
                              <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                              </div>
                            ) : teamMembers.length === 0 ? (
                              <div className="p-6 text-center text-muted-foreground bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
                                <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
                                <p>No members yet</p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {teamMembers.map((member) => {
                                  const isSelf = member.user_id === selfUserId;
                                  const canEditMember = canManageMembers && !isSelf && member.role !== 'owner';
                                  const canRemoveMember = canManageMembers && !isSelf && !(member.role === 'owner' && !isTeamOwner);

                                  return (
                                    <div
                                      key={member.user_id}
                                      className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg"
                                    >
                                      <div className="flex items-center gap-3">
                                        <Avatar className="h-9 w-9">
                                          <AvatarFallback className="bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 text-xs font-medium">
                                            {getTeamMemberInitials(member.email, member.full_name)}
                                          </AvatarFallback>
                                        </Avatar>
                                        <div>
                                          <div className="flex items-center gap-2">
                                            <span className="font-medium text-sm">
                                              {member.full_name || member.email}
                                            </span>
                                            {isSelf && (
                                              <Badge variant="outline" className="text-xs">You</Badge>
                                            )}
                                          </div>
                                          <p className="text-xs text-muted-foreground">{member.email}</p>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-2">
                                        {canEditMember ? (
                                          <Select
                                            value={member.role}
                                            onValueChange={(v) => handleUpdateMemberRole(member, v as TeamRole)}
                                          >
                                            <SelectTrigger className="w-[110px] h-8 text-xs">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="member">Member</SelectItem>
                                              <SelectItem value="admin">Admin</SelectItem>
                                              {isTeamOwner && <SelectItem value="owner">Owner</SelectItem>}
                                            </SelectContent>
                                          </Select>
                                        ) : (
                                          <Badge variant={getRoleBadgeVariant(member.role as TeamRole)} className="gap-1 capitalize">
                                            <RoleIcon role={member.role as TeamRole} />
                                            {member.role}
                                          </Badge>
                                        )}

                                        {canRemoveMember && (
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-muted-foreground hover:text-red-600"
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
                            <div>
                              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                                <Clock className="h-4 w-4 text-muted-foreground" />
                                Pending Invitations
                              </h3>
                              <div className="space-y-2">
                                {pendingInvitations.map((inv) => (
                                  <div
                                    key={inv.id}
                                    className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg"
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className="h-9 w-9 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                                        <Mail className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                      </div>
                                      <div>
                                        <p className="font-medium text-sm">{inv.email}</p>
                                        <p className="text-xs text-muted-foreground">
                                          Expires {new Date(inv.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </p>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <Badge variant="outline" className="capitalize">{inv.role}</Badge>
                                      {inv.token && (
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8"
                                          onClick={() => copyInviteLink(inv.token)}
                                          title="Copy invite link"
                                        >
                                          <Copy className="h-4 w-4" />
                                        </Button>
                                      )}
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground hover:text-red-600"
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
                          <div className="p-4 bg-zinc-50 dark:bg-zinc-800/30 rounded-lg">
                            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                              <Shield className="h-4 w-4 text-muted-foreground" />
                              Role Permissions
                            </h3>
                            <div className="grid gap-3 sm:grid-cols-3">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <Crown className="h-4 w-4 text-amber-500" />
                                  <span className="font-medium text-sm">Owner</span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Full access. Can delete team and transfer ownership.
                                </p>
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <Shield className="h-4 w-4 text-blue-500" />
                                  <span className="font-medium text-sm">Admin</span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Can invite members and manage roles.
                                </p>
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <Users className="h-4 w-4 text-zinc-500" />
                                  <span className="font-medium text-sm">Member</span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Can view and edit team presentations.
                                </p>
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
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
              {isCreatingTeam ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create team'}
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
              This will permanently delete "{selectedTeam?.name}" and remove all members. This action cannot be undone.
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
              Are you sure you want to remove {memberToRemove?.email} from the team? They will lose access to all team presentations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveMember} className="bg-red-600 hover:bg-red-700">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create API Key Dialog */}
      <Dialog open={showCreateKeyDialog} onOpenChange={(open) => {
        if (!open) resetCreateKeyForm();
        else setShowCreateKeyDialog(true);
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{newKeyData ? 'API Key Created' : 'Create API Key'}</DialogTitle>
            <DialogDescription>
              {newKeyData
                ? 'Copy your API key now. It will only be shown once!'
                : 'Create a new API key to access the Developer API.'
              }
            </DialogDescription>
          </DialogHeader>

          {newKeyData ? (
            <div className="space-y-4">
              <div className="p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-800 dark:text-amber-200">
                      Store this key securely
                    </p>
                    <p className="text-amber-700 dark:text-amber-300">
                      This is the only time you'll see the full API key.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Your API Key</Label>
                <div className="flex gap-2">
                  <Input
                    value={newKeyData.api_key}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    onClick={() => handleCopyApiKey(newKeyData.api_key)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <DialogFooter>
                <Button onClick={resetCreateKeyForm}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="key-name">Name</Label>
                <Input
                  id="key-name"
                  placeholder="e.g., Production, Development"
                  value={newKeyForm.name}
                  onChange={(e) => setNewKeyForm(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="context">Custom Instructions (optional)</Label>
                <Textarea
                  id="context"
                  placeholder="Add custom instructions for deck generation..."
                  value={newKeyForm.context_instructions}
                  onChange={(e) => setNewKeyForm(prev => ({ ...prev, context_instructions: e.target.value }))}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  These instructions will be applied to all decks created with this key.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="webhook">Webhook URL (optional)</Label>
                <Input
                  id="webhook"
                  type="url"
                  placeholder="https://your-app.com/webhook"
                  value={newKeyForm.webhook_url}
                  onChange={(e) => setNewKeyForm(prev => ({ ...prev, webhook_url: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  We'll POST to this URL when deck generation completes.
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="edit-link">Include Edit Link</Label>
                  <p className="text-xs text-muted-foreground">
                    Return an editable link in addition to view-only
                  </p>
                </div>
                <Switch
                  id="edit-link"
                  checked={newKeyForm.include_edit_link}
                  onCheckedChange={(checked) => setNewKeyForm(prev => ({ ...prev, include_edit_link: checked }))}
                />
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={resetCreateKeyForm}>Cancel</Button>
                <Button onClick={handleCreateApiKey} disabled={creatingKey}>
                  {creatingKey ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Key'
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit API Key Dialog */}
      <Dialog open={showEditKeyDialog} onOpenChange={setShowEditKeyDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit API Key</DialogTitle>
            <DialogDescription>
              Update settings for {selectedKey?.name}
            </DialogDescription>
          </DialogHeader>

          {selectedKey && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  value={selectedKey.name}
                  onChange={(e) => setSelectedKey(prev => prev ? { ...prev, name: e.target.value } : null)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-context">Custom Instructions</Label>
                <Textarea
                  id="edit-context"
                  value={selectedKey.context_instructions || ''}
                  onChange={(e) => setSelectedKey(prev => prev ? { ...prev, context_instructions: e.target.value } : null)}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-webhook">Webhook URL</Label>
                <Input
                  id="edit-webhook"
                  type="url"
                  placeholder="https://your-app.com/webhook"
                  value={selectedKey.webhook_url || ''}
                  onChange={(e) => setSelectedKey(prev => prev ? { ...prev, webhook_url: e.target.value } : null)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Include Edit Link</Label>
                  <p className="text-xs text-muted-foreground">
                    Return editable links in API responses
                  </p>
                </div>
                <Switch
                  checked={selectedKey.include_edit_link}
                  onCheckedChange={(checked) => setSelectedKey(prev => prev ? { ...prev, include_edit_link: checked } : null)}
                />
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowEditKeyDialog(false)}>Cancel</Button>
                <Button onClick={() => handleUpdateApiKey(selectedKey.id, {
                  name: selectedKey.name,
                  context_instructions: selectedKey.context_instructions,
                  webhook_url: selectedKey.webhook_url,
                  include_edit_link: selectedKey.include_edit_link
                })}>
                  Save Changes
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Welcome Modal */}
      <WelcomeModal
        isOpen={welcomeModal.show}
        onClose={() => setWelcomeModal(prev => ({ ...prev, show: false }))}
        planName={welcomeModal.planName}
        monthlyCredits={welcomeModal.credits}
        isFriendsFamily={welcomeModal.isFriendsFamily}
      />

      {/* Cancellation Modal */}
      <CancellationModal
        isOpen={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        onConfirm={handleCancelSubscription}
        planName={billingSubscription?.plan_name || 'your plan'}
        currentCredits={billingBalance?.monthly_credits || 0}
        periodEnd={billingSubscription?.current_period_end || null}
      />
    </div>
  );
};

export default Profile;

// Google Integration Button Component
const GoogleIntegrationButton: React.FC = () => {
  const [loading, setLoading] = React.useState(false);
  const [status, setStatus] = React.useState<{ connected: boolean; email?: string } | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const s = await googleIntegrationApi.getAuthStatus();
      setStatus({ connected: !!s.connected, email: s.email });
    } catch {
      setStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const handleConnect = React.useCallback(async () => {
    try {
      const url = await googleIntegrationApi.initiateAuth();
      window.location.href = url;
    } catch (e: any) {
      // noop
    }
  }, []);

  const handleDisconnect = React.useCallback(async () => {
    setLoading(true);
    try {
      await googleIntegrationApi.disconnect();
      await refresh();
    } catch {
      // noop
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  if (loading && !status) {
    return <Button size="sm" variant="outline" disabled>Checking...</Button>;
  }

  if (status?.connected) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground hidden sm:inline">{status.email}</span>
        <Button size="sm" variant="outline" onClick={handleDisconnect}>
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <Button size="sm" onClick={handleConnect}>
      Connect
    </Button>
  );
};
