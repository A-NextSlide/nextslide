import React, { useState, useEffect } from 'react';
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
  EyeOff
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { googleIntegrationApi } from '@/services/googleIntegrationApi';
import { billingApi, type CreditBalance, type Subscription, type UsageStats } from '@/services/billingApi';
import { WelcomeModal } from '@/components/billing/WelcomeModal';
import { CancellationModal } from '@/components/billing/CancellationModal';

type SettingsTab = 'profile' | 'security' | 'notifications' | 'billing' | 'integrations';

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
  const [billingLoading, setBillingLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [welcomeModal, setWelcomeModal] = useState<{ show: boolean; planName: string; credits: number }>({
    show: false,
    planName: '',
    credits: 0
  });

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
    if (billingSuccess === 'success' && !authLoading && user) {
      const syncAndRefresh = async () => {
        setBillingLoading(true);
        try {
          // Sync subscription from Stripe
          const syncResult = await billingApi.syncSubscription();
          if (syncResult.synced && syncResult.monthly_credits) {
            setWelcomeModal({
              show: true,
              planName: syncResult.plan_id === 'pro' ? 'Pro' : 'Starter',
              credits: syncResult.monthly_credits
            });
          }
          // Load fresh billing data
          const [balance, subscription, usage] = await Promise.all([
            billingApi.getBalance(),
            billingApi.getSubscription(),
            billingApi.getUsageStats()
          ]);
          setBillingBalance(balance);
          setBillingSubscription(subscription);
          setBillingUsage(usage);
        } catch (err) {
          console.error('Failed to sync subscription:', err);
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
    if (authLoading || !user) return;
    // Skip if we're handling checkout success
    if (searchParams.get('billing') === 'success') return;

    const loadBillingData = async () => {
      setBillingLoading(true);
      try {
        const [balance, subscription, usage] = await Promise.all([
          billingApi.getBalance(),
          billingApi.getSubscription(),
          billingApi.getUsageStats()
        ]);
        setBillingBalance(balance);
        setBillingSubscription(subscription);
        setBillingUsage(usage);
      } catch (err) {
        console.error('Failed to load billing data:', err);
      } finally {
        setBillingLoading(false);
      }
    };
    loadBillingData();
  }, [authLoading, user, searchParams]);

  // Handle manage billing click
  const handleManageBilling = async () => {
    setPortalLoading(true);
    try {
      const session = await billingApi.createPortalSession();
      window.location.href = session.url;
    } catch (err) {
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

  const navItems = [
    { id: 'profile' as const, label: 'Profile', icon: User },
    { id: 'security' as const, label: 'Security', icon: Shield },
    { id: 'billing' as const, label: 'Billing', icon: CreditCard },
    { id: 'integrations' as const, label: 'Integrations', icon: Link2 },
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
                  <Badge variant="secondary" className="font-normal">
                    {billingSubscription?.plan_name || 'Free'}
                  </Badge>
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
                              {billingSubscription?.plan_name || 'Free'}
                            </h3>
                          </div>

                          {billingSubscription?.plan_id === 'free' ? (
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
                            <div className="flex items-end justify-between">
                              <div>
                                <p className="text-sm text-muted-foreground mb-1">Credits</p>
                                <p className="text-2xl font-medium tabular-nums">
                                  {billingBalance.remaining_credits}
                                  <span className="text-base text-muted-foreground font-normal"> / {billingBalance.monthly_credits}</span>
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
                                  width: `${Math.min(100, (billingBalance.remaining_credits / billingBalance.monthly_credits) * 100)}%`
                                }}
                              />
                            </div>

                            {/* Overage notice for Pro users */}
                            {billingBalance.can_use_overage && billingBalance.overage_credits > 0 && (
                              <p className="text-sm text-muted-foreground">
                                {billingBalance.overage_credits} overage credits · ${(billingBalance.overage_cost_cents / 100).toFixed(2)} on next invoice
                              </p>
                            )}

                            {/* Overage availability for Pro */}
                            {billingBalance.can_use_overage && billingBalance.overage_credits === 0 && (
                              <p className="text-sm text-muted-foreground">
                                Pro plan: Additional credits available at $0.03 each
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Upgrade prompt for free users */}
                      {billingSubscription?.plan_id === 'free' && (
                        <div className="p-4 bg-gradient-to-r from-zinc-100 to-zinc-50 dark:from-zinc-800/50 dark:to-zinc-800/30 rounded-lg border border-zinc-200 dark:border-zinc-700">
                          <div className="flex items-start gap-3">
                            <Zap className="h-5 w-5 text-amber-500 mt-0.5" />
                            <div className="flex-1">
                              <p className="font-medium text-sm mb-1">Upgrade for more credits</p>
                              <p className="text-sm text-muted-foreground">
                                Get up to 500 credits/month with Pro, plus priority support and unlimited presentations.
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
                          {billingSubscription?.plan_id !== 'free' && (
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
                        {billingSubscription?.plan_id !== 'free' && !billingSubscription?.cancel_at_period_end && (
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
            </div>
          </main>
        </div>
      </div>

      {/* Welcome Modal */}
      <WelcomeModal
        isOpen={welcomeModal.show}
        onClose={() => setWelcomeModal(prev => ({ ...prev, show: false }))}
        planName={welcomeModal.planName}
        monthlyCredits={welcomeModal.credits}
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
