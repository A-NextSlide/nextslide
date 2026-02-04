import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Copy,
  Check,
  Users,
  Gift,
  Zap,
  Mail,
  Share2,
  Loader2,
  UserPlus,
  ExternalLink,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { referralApi, type ReferralStats, type ReferralListItem, type ReferralCode } from '@/services/referralApi';
import { trackEvent } from '@/services/analytics';
import { nativeBridge } from '@/utils/nativeBridge';

const ReferralDashboard: React.FC = () => {
  // Code state — null means "no code yet"
  const [codeInfo, setCodeInfo] = useState<ReferralCode | null>(null);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [referrals, setReferrals] = useState<ReferralListItem[]>([]);

  // Loading
  const [checkingExisting, setCheckingExisting] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  // Custom code input
  const [customCode, setCustomCode] = useState('');
  const [codeAvailability, setCodeAvailability] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');

  // Copy state
  const [copied, setCopied] = useState(false);

  // Check if user already has a referral code (without creating one)
  useEffect(() => {
    const checkExisting = async () => {
      setCheckingExisting(true);
      try {
        const code = await referralApi.getMyCode();
        if (code) {
          setCodeInfo(code);
          loadStatsAndReferrals();
        }
      } catch {
        setCodeInfo(null);
      } finally {
        setCheckingExisting(false);
      }
    };
    checkExisting();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadStatsAndReferrals = useCallback(async () => {
    setStatsLoading(true);
    try {
      const [statsResult, listResult] = await Promise.all([
        referralApi.getReferralStats(),
        referralApi.getReferralList(),
      ]);
      setStats(statsResult);
      setReferrals(listResult.referrals);
    } catch (err) {
      console.error('[ReferralDashboard] Failed to load stats:', err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // Validate custom code format
  const isValidCode = (code: string) => /^[a-zA-Z0-9][a-zA-Z0-9-]{1,18}[a-zA-Z0-9]$/.test(code);

  // Check availability of custom code
  const handleCheckAvailability = async () => {
    if (!customCode.trim()) return;
    const code = customCode.trim().toLowerCase();

    if (code.length < 3 || code.length > 20) {
      setCodeAvailability('invalid');
      return;
    }
    if (!isValidCode(code)) {
      setCodeAvailability('invalid');
      return;
    }

    setCodeAvailability('checking');
    try {
      const result = await referralApi.lookupReferralCode(code);
      setCodeAvailability(result ? 'taken' : 'available');
    } catch {
      // 404 = not found = available
      setCodeAvailability('available');
    }
  };

  // Create code (either custom or random)
  const handleCreateCode = async (useCustom: boolean) => {
    setCreating(true);
    try {
      const result = await referralApi.createReferralCode(useCustom ? customCode.trim().toLowerCase() : undefined);
      setCodeInfo(result);
      trackEvent('referral_code_created', { code: result.code, custom: useCustom });
      toast({
        title: 'Referral code created!',
        description: `Your code is: ${result.code}`,
      });
      loadStatsAndReferrals();
    } catch (err: any) {
      toast({
        title: 'Failed to create code',
        description: err.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleCopyLink = async () => {
    const url = codeInfo?.referral_url || stats?.referral_url;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      trackEvent('referral_code_copied', { code: codeInfo?.code || stats?.code });
      toast({ title: 'Link copied!', description: 'Share this link with friends to earn credits.' });
    } catch {
      toast({ title: 'Failed to copy', description: 'Please copy the link manually.', variant: 'destructive' });
    }
  };

  const handleShareEmail = () => {
    const url = codeInfo?.referral_url || stats?.referral_url;
    if (!url) return;
    const subject = encodeURIComponent('Create amazing AI presentations with NextSlide');
    const body = encodeURIComponent(
      `Hey! I've been using NextSlide to create AI-powered presentations in seconds. You should try it!\n\nSign up with my link and we both get free credits:\n${url}`,
    );
    nativeBridge.openExternal(`mailto:?subject=${subject}&body=${body}`);
    trackEvent('referral_link_shared', { platform: 'email', code: codeInfo?.code || stats?.code });
  };

  const handleShareTwitter = () => {
    const url = codeInfo?.referral_url || stats?.referral_url;
    if (!url) return;
    const text = encodeURIComponent(
      `I've been creating AI presentations in seconds with @NextSlideAI. Try it out and we both get free credits! ${url}`,
    );
    nativeBridge.openExternal(`https://twitter.com/intent/tweet?text=${text}`);
    trackEvent('referral_link_shared', { platform: 'twitter', code: codeInfo?.code || stats?.code });
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'signed_up':
        return <Badge variant="secondary" className="text-xs">Signed Up</Badge>;
      case 'activated':
        return <Badge className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Activated</Badge>;
      case 'rewarded':
        return <Badge className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Rewarded</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  };

  // Loading state — only a lightweight skeleton
  if (checkingExisting) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-black/5 dark:bg-white/5 rounded-lg animate-pulse" />
        <div className="h-4 w-96 bg-black/5 dark:bg-white/5 rounded animate-pulse" />
        <div className="h-48 bg-black/5 dark:bg-white/5 rounded-2xl animate-pulse" />
      </div>
    );
  }

  // ---------- No code yet: Generate UI ----------
  if (!codeInfo) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-lg font-black font-['HK_Grotesk_Wide'] text-black dark:text-white">
            Invite Friends, Earn Credits
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Share your referral link. When a friend signs up and creates their first presentation, you both earn credits.
          </p>
        </div>

        {/* Generate Card */}
        <div className="rounded-2xl border-2 border-black/10 dark:border-white/10 bg-white dark:bg-zinc-900 p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-[#FF4301]/10 flex items-center justify-center mx-auto mb-5">
            <Gift className="w-8 h-8 text-[#FF4301]" />
          </div>
          <h3 className="text-xl font-bold mb-2">Get Your Referral Code</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
            You get <span className="font-semibold text-[#FF4301]">50 credits</span> when your friend creates their first presentation.
            They get <span className="font-semibold text-[#FF4301]">25 credits</span> on signup.
          </p>

          {/* Custom code input */}
          <div className="max-w-sm mx-auto space-y-3 mb-6">
            <div className="flex gap-2">
              <Input
                placeholder="Pick your code (e.g. sarah23)"
                value={customCode}
                onChange={(e) => {
                  setCustomCode(e.target.value.replace(/[^a-zA-Z0-9-]/g, ''));
                  setCodeAvailability('idle');
                }}
                className="rounded-xl border-2 border-black/10 dark:border-white/10 text-center font-mono"
                maxLength={20}
              />
              <Button
                variant="outline"
                onClick={handleCheckAvailability}
                disabled={!customCode.trim() || customCode.trim().length < 3 || codeAvailability === 'checking'}
                className="shrink-0 rounded-xl border-2 border-black/10 dark:border-white/10 hover:border-[#FF4301]"
              >
                {codeAvailability === 'checking' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Check'
                )}
              </Button>
            </div>

            {/* Availability feedback */}
            {codeAvailability === 'available' && (
              <div className="flex items-center justify-center gap-2 text-sm text-green-600 dark:text-green-400">
                <Check className="h-4 w-4" />
                <span className="font-medium">"{customCode.toLowerCase()}" is available!</span>
              </div>
            )}
            {codeAvailability === 'taken' && (
              <div className="flex items-center justify-center gap-2 text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="h-4 w-4" />
                <span>Already taken, try another</span>
              </div>
            )}
            {codeAvailability === 'invalid' && (
              <div className="flex items-center justify-center gap-2 text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="h-4 w-4" />
                <span>3-20 chars, letters, numbers & hyphens only</span>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            {codeAvailability === 'available' && (
              <Button
                onClick={() => handleCreateCode(true)}
                disabled={creating}
                className="bg-[#FF4301] text-white hover:bg-[#E63901] rounded-xl px-8"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Claim "{customCode.toLowerCase()}"
              </Button>
            )}
            <Button
              onClick={() => handleCreateCode(false)}
              disabled={creating}
              variant={codeAvailability === 'available' ? 'outline' : 'default'}
              className={codeAvailability === 'available'
                ? 'rounded-xl border-2 border-black/10 dark:border-white/10 hover:border-[#FF4301]'
                : 'bg-[#FF4301] text-white hover:bg-[#E63901] rounded-xl px-8'
              }
            >
              {creating && codeAvailability !== 'available' ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Gift className="h-4 w-4 mr-2" />
              )}
              Generate Random Code
            </Button>
          </div>
        </div>

        {/* How it works */}
        <div className="rounded-2xl border-2 border-black/10 dark:border-white/10 bg-white dark:bg-zinc-900 p-6">
          <h3 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wider">How it works</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { icon: Share2, title: 'Share your link', desc: 'Send your unique referral link to friends' },
              { icon: UserPlus, title: 'Friend signs up', desc: 'They get 25 bonus credits on signup' },
              { icon: Gift, title: 'Earn rewards', desc: 'You get 50 credits when they create a deck' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-[#FF4301]/10 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-[#FF4301]" />
                </div>
                <div>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ---------- Has code: Dashboard ----------
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-black font-['HK_Grotesk_Wide'] text-black dark:text-white">
          Invite Friends, Earn Credits
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Share your referral link. When a friend signs up and creates their first presentation, you both earn credits.
        </p>
      </div>

      {/* Referral Link Card */}
      <div className="rounded-2xl border-2 border-black/10 dark:border-white/10 bg-white dark:bg-zinc-900 p-6">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-full bg-[#FF4301]/10 flex items-center justify-center">
            <Share2 className="w-4 h-4 text-[#FF4301]" />
          </div>
          <h3 className="font-semibold text-sm">Your Referral Link</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4 ml-10">
          You get 50 credits when they create their first presentation. They get 25 credits on signup.
        </p>

        <div className="flex items-center gap-2 mb-4">
          <div className="flex-1 bg-black/[0.03] dark:bg-white/[0.05] border-2 border-black/10 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm truncate font-mono">
            {codeInfo.referral_url || stats?.referral_url || '...'}
          </div>
          <Button
            onClick={handleCopyLink}
            className={copied
              ? 'bg-green-600 text-white hover:bg-green-700 rounded-xl shrink-0'
              : 'bg-[#FF4301] text-white hover:bg-[#E63901] rounded-xl shrink-0'
            }
            size="sm"
          >
            {copied ? (
              <><Check className="w-4 h-4 mr-1.5" /> Copied</>
            ) : (
              <><Copy className="w-4 h-4 mr-1.5" /> Copy</>
            )}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleShareEmail}
            className="rounded-xl border-2 border-black/10 dark:border-white/10 hover:border-[#FF4301]"
          >
            <Mail className="w-4 h-4 mr-1.5" />
            Email
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleShareTwitter}
            className="rounded-xl border-2 border-black/10 dark:border-white/10 hover:border-[#FF4301]"
          >
            <ExternalLink className="w-4 h-4 mr-1.5" />
            Twitter
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {statsLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-2xl border-2 border-black/10 dark:border-white/10 bg-white dark:bg-zinc-900 p-5 animate-pulse">
              <div className="h-10 w-10 rounded-full bg-black/5 dark:bg-white/5 mb-3" />
              <div className="h-6 w-12 bg-black/5 dark:bg-white/5 rounded mb-1" />
              <div className="h-3 w-16 bg-black/5 dark:bg-white/5 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: UserPlus, label: 'Total Invites', value: stats?.total_referrals ?? 0, color: 'text-[#FF4301]', bg: 'bg-[#FF4301]/10' },
            { icon: Users, label: 'Signups', value: stats?.total_signups ?? 0, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30' },
            { icon: Zap, label: 'Activated', value: stats?.total_activated ?? 0, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-900/30' },
            { icon: Gift, label: 'Credits Earned', value: stats?.total_credits_earned ?? 0, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/30' },
          ].map(({ icon: Icon, label, value, color, bg }) => (
            <div key={label} className="rounded-2xl border-2 border-black/10 dark:border-white/10 bg-white dark:bg-zinc-900 p-5">
              <div className={`w-10 h-10 rounded-full ${bg} flex items-center justify-center mb-3`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Referral List */}
      {referrals.length > 0 && (
        <div className="rounded-2xl border-2 border-black/10 dark:border-white/10 bg-white dark:bg-zinc-900 p-6">
          <h3 className="font-semibold text-sm mb-4">Your Referrals</h3>
          <div className="space-y-3">
            {referrals.map((ref) => (
              <div
                key={ref.id}
                className="flex items-center justify-between py-2 border-b border-black/5 dark:border-white/5 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#FF4301]/10 flex items-center justify-center">
                    <Users className="w-4 h-4 text-[#FF4301]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{ref.referee_email}</p>
                    <p className="text-xs text-muted-foreground">
                      Joined {new Date(ref.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {ref.referrer_credits_awarded > 0 && (
                    <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                      +{ref.referrer_credits_awarded} credits
                    </span>
                  )}
                  {statusBadge(ref.status)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state for referrals */}
      {referrals.length === 0 && !statsLoading && (
        <div className="rounded-2xl border-2 border-black/10 dark:border-white/10 bg-white dark:bg-zinc-900 p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-[#FF4301]/10 flex items-center justify-center mx-auto mb-4">
            <Gift className="w-6 h-6 text-[#FF4301]" />
          </div>
          <p className="text-sm font-medium mb-1">No referrals yet</p>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Share your referral link with friends to start earning credits.
          </p>
        </div>
      )}
    </div>
  );
};

export default ReferralDashboard;
