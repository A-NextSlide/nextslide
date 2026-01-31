import React, { useState, useEffect, useCallback } from 'react';
import AdminLayoutV2 from '@/components/admin/AdminLayoutV2';
import { adminApi, GrowthStats, GrowthReferrals, GrowthGamification, GrowthNotifications, GrowthPqa, GrowthViral } from '@/services/adminApi';
import { useToast } from '@/hooks/use-toast';
import { useSearchParams } from 'react-router-dom';
import AdminCommunityPanel from '@/components/admin/AdminCommunityPanel';
import AdminLeadsPanel from '@/components/admin/AdminLeadsPanel';
import { gamificationApi, type BadgeDefinition } from '@/services/gamificationApi';
import {
  Sparkles, Layers, Trophy, Zap, Eye, Star, Flame, Repeat, Award, Users, Share2, Crown, Play,
  type LucideIcon,
} from 'lucide-react';
import { useReward } from '@/context/RewardContext';
import { cn } from '@/lib/utils';

// ==================== Design Tokens (match AdminServices) ====================
const sectionHeading = "text-[10px] font-bold uppercase tracking-wider text-[#FF4301]";
const cardClass = "bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-xl";

// ==================== Reusable Components ====================

const MetricCard = ({ label, value, sublabel }: { label: string; value: string | number; sublabel?: string }) => (
  <div className={cn(cardClass, "p-2.5")}>
    <div className="text-[10px] text-[#888] mb-1">{label}</div>
    <div className="text-lg font-semibold tabular-nums leading-tight">{value}</div>
    {sublabel && <div className="text-[10px] text-[#999] mt-0.5">{sublabel}</div>}
  </div>
);

const ToggleSwitch = ({ enabled, onChange, label }: { enabled: boolean; onChange: (v: boolean) => void; label: string }) => (
  <div className="flex items-center justify-between py-2">
    <span className="text-sm text-[#666] dark:text-[#ccc]">{label}</span>
    <button
      onClick={() => onChange(!enabled)}
      className={`relative w-10 h-5 rounded-full transition-colors ${enabled ? 'bg-[#FF4301]' : 'bg-[#ddd] dark:bg-[#444]'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${enabled ? 'translate-x-5' : ''}`} />
    </button>
  </div>
);

const ConfigRow = ({ label, configKey, value, type = 'number', onSave }: {
  label: string; configKey: string; value: any; type?: 'number' | 'text';
  onSave: (key: string, value: any) => Promise<void>;
}) => {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState(String(value));
  const handleSave = async () => {
    await onSave(configKey, type === 'number' ? Number(inputValue) : inputValue);
    setEditing(false);
  };
  return (
    <div className="flex items-center justify-between py-2 border-b border-[#eaeaea] dark:border-[#333] last:border-0">
      <span className="text-sm text-[#666] dark:text-[#ccc]">{label}</span>
      {editing ? (
        <div className="flex items-center gap-2">
          <input
            type={type}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="w-20 px-2 py-1 text-sm border border-[#ddd] dark:border-[#555] rounded bg-white dark:bg-[#222] text-black dark:text-white"
          />
          <button onClick={handleSave} className="text-xs text-[#FF4301] font-medium">Save</button>
          <button onClick={() => setEditing(false)} className="text-xs text-[#999]">Cancel</button>
        </div>
      ) : (
        <button onClick={() => { setInputValue(String(value)); setEditing(true); }} className="text-sm font-mono text-black dark:text-white hover:text-[#FF4301]">
          {value}
        </button>
      )}
    </div>
  );
};

const SectionCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className={cn(cardClass, "p-4 mb-3")}>
    <h3 className="text-xs font-medium mb-2">{title}</h3>
    {children}
  </div>
);

const LoadingSpinner = () => (
  <div className="flex items-center justify-center py-12">
    <div className="w-6 h-6 border-2 border-[#eaeaea] dark:border-[#333] border-t-black dark:border-t-white rounded-full animate-spin" />
  </div>
);

const InlineCreditsEditor = ({ value, configKey, onSave }: {
  value: number; configKey: string;
  onSave: (key: string, value: any) => Promise<void>;
}) => {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState(String(value));
  const handleSave = async () => {
    await onSave(configKey, Number(inputValue));
    setEditing(false);
  };
  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className="w-16 px-2 py-1 text-xs border border-[#ddd] dark:border-[#555] rounded bg-white dark:bg-[#222] text-black dark:text-white text-right"
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
        />
        <button onClick={handleSave} className="text-[10px] text-[#FF4301] font-medium">Save</button>
        <button onClick={() => setEditing(false)} className="text-[10px] text-[#999]">X</button>
      </div>
    );
  }
  return (
    <button
      onClick={() => { setInputValue(String(value)); setEditing(true); }}
      className="text-sm font-mono text-[#FF4301] hover:underline"
      title="Click to edit"
    >
      {value} credits
    </button>
  );
};

// ==================== Helpers ====================

const getRelativeTime = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return date.toLocaleDateString();
};

// ==================== Badge Helpers ====================

const BADGE_ICON_MAP: Record<string, LucideIcon> = {
  sparkles: Sparkles, layers: Layers, trophy: Trophy, zap: Zap, eye: Eye,
  star: Star, flame: Flame, repeat: Repeat, award: Award, users: Users,
  share2: Share2, crown: Crown,
};

const CATEGORY_COLORS: Record<string, string> = {
  creation: 'text-amber-500',
  views: 'text-blue-500',
  community: 'text-purple-500',
  streak: 'text-orange-500',
};

const CATEGORY_LABELS: Record<string, string> = {
  creation: 'Creation',
  views: 'Views & Popularity',
  community: 'Community',
  streak: 'Streak',
};

// Streak milestones as defined in StreakDisplay.tsx — keys match backend growth_config reads
const STREAK_MILESTONES = [
  { days: 3, configKey: 'streaks.milestone.3_day_credits', responseKey: '3_day_credits', defaultCredits: 10 },
  { days: 7, configKey: 'streaks.milestone.7_day_credits', responseKey: '7_day_credits', defaultCredits: 25 },
  { days: 30, configKey: 'streaks.milestone.30_day_credits', responseKey: '30_day_credits', defaultCredits: 100 },
];

// Reward modal presets — keys match backend growth_config reads
const REWARD_PRESETS = [
  { key: 'rewards.welcome_bonus', label: 'Welcome Bonus (new users)', responseKey: 'welcome_bonus', defaultAmount: 450 },
  { key: 'rewards.referral_bonus', label: 'Referral Bonus', responseKey: 'referral_bonus', defaultAmount: 50 },
  { key: 'rewards.achievement_bonus', label: 'Achievement Bonus', responseKey: 'achievement_bonus', defaultAmount: 25 },
  { key: 'rewards.promo_bonus', label: 'Promotional Bonus', responseKey: 'promo_bonus', defaultAmount: 100 },
];

// ==================== Tab Definitions ====================

const tabs = [
  { id: 'referrals', label: 'Referrals' },
  { id: 'gamification', label: 'Gamification' },
  { id: 'community', label: 'Community' },
  { id: 'leads', label: 'Leads' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'seo', label: 'SEO & Templates' },
  { id: 'enterprise', label: 'Enterprise' },
  { id: 'viral', label: 'Viral' },
];

// ==================== Main Component ====================

const AdminGrowth: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = tabs.some(t => t.id === searchParams.get('tab')) ? searchParams.get('tab')! : 'referrals';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [stats, setStats] = useState<GrowthStats | null>(null);
  const [referrals, setReferrals] = useState<GrowthReferrals | null>(null);
  const [gamification, setGamification] = useState<GrowthGamification | null>(null);
  const [allBadges, setAllBadges] = useState<BadgeDefinition[]>([]);
  const [notifications, setNotifications] = useState<GrowthNotifications | null>(null);
  const [pqa, setPqa] = useState<GrowthPqa | null>(null);
  const [viral, setViral] = useState<GrowthViral | null>(null);
  const [loading, setLoading] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testTemplate, setTestTemplate] = useState('weekly_digest');
  // Notification composer state
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [notifImageUrl, setNotifImageUrl] = useState('');
  const [notifTarget, setNotifTarget] = useState('all');
  const [notifType, setNotifType] = useState('system');
  const [notifSending, setNotifSending] = useState(false);
  // Notification history state
  const [notifHistory, setNotifHistory] = useState<any[]>([]);
  const [notifHistoryTotal, setNotifHistoryTotal] = useState(0);
  const [notifHistoryPage, setNotifHistoryPage] = useState(1);
  const [expandedNotifId, setExpandedNotifId] = useState<string | null>(null);
  const { toast } = useToast();
  const { showBadgeUnlock, showReward } = useReward();

  const loadTabData = useCallback(async (tab: string) => {
    setLoading(true);
    try {
      switch (tab) {
        case 'referrals': {
          const data = await adminApi.getGrowthReferrals();
          setReferrals(data);
          break;
        }
        case 'gamification': {
          const [data, badgesResp] = await Promise.all([
            adminApi.getGrowthGamification(),
            gamificationApi.getBadges().catch(() => null),
          ]);
          setGamification(data);
          if (badgesResp?.all_badges) setAllBadges(badgesResp.all_badges);
          break;
        }
        case 'community':
        case 'leads': {
          // These tabs use their own panels with independent data fetching
          break;
        }
        case 'notifications': {
          const [data, history] = await Promise.all([
            adminApi.getGrowthNotifications(),
            adminApi.getNotificationHistory(1, 30).catch(() => ({ notifications: [], total: 0, page: 1, limit: 30, total_pages: 0 })),
          ]);
          setNotifications(data);
          setNotifHistory(history.notifications);
          setNotifHistoryTotal(history.total);
          setNotifHistoryPage(1);
          break;
        }
        case 'enterprise': {
          const data = await adminApi.getGrowthPqa();
          setPqa(data);
          break;
        }
        case 'viral': {
          const data = await adminApi.getGrowthViral();
          setViral(data);
          break;
        }
      }
    } catch (err) {
      console.error(`Error loading ${tab} data:`, err);
      toast({ title: 'Error', description: `Failed to load ${tab} data`, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Load overview stats on mount
  useEffect(() => {
    const loadStats = async () => {
      try {
        const data = await adminApi.getGrowthStats();
        setStats(data);
      } catch (err) {
        console.error('Error loading growth stats:', err);
      }
    };
    loadStats();
  }, []);

  // Load tab data when tab changes
  useEffect(() => {
    loadTabData(activeTab);
  }, [activeTab, loadTabData]);

  const handleConfigSave = async (key: string, value: any) => {
    try {
      await adminApi.updateGrowthConfig(key, value);
      toast({ title: 'Config updated', description: `${key} = ${JSON.stringify(value)}` });
      // Refresh the current tab data
      loadTabData(activeTab);
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to update config', variant: 'destructive' });
    }
  };

  const handleToggle = async (key: string, value: boolean) => {
    await handleConfigSave(key, value);
  };

  const handleSendTestEmail = async () => {
    if (!testEmail) {
      toast({ title: 'Error', description: 'Please enter an email address', variant: 'destructive' });
      return;
    }
    try {
      const result = await adminApi.sendTestEmail(testEmail, testTemplate);
      toast({ title: 'Success', description: result.message || 'Test email sent' });
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to send test email', variant: 'destructive' });
    }
  };

  // ==================== Tab Renderers ====================

  const renderReferrals = () => {
    if (loading || !referrals) return <LoadingSpinner />;
    return (
      <div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <MetricCard label="Total Codes" value={referrals.stats.total_codes} />
          <MetricCard label="Signups" value={referrals.stats.total_signups} />
          <MetricCard label="Activated" value={referrals.stats.total_activated} />
          <MetricCard label="Credits Earned" value={referrals.stats.total_credits} />
        </div>

        <SectionCard title="Configuration">
          <ToggleSwitch
            enabled={referrals.config.enabled}
            onChange={(v) => handleToggle('referral.enabled', v)}
            label="Enable Referral Program"
          />
          <ConfigRow
            label="Referee Signup Credits"
            configKey="referral.referee_signup_credits"
            value={referrals.config.referee_signup_credits}
            onSave={handleConfigSave}
          />
          <ConfigRow
            label="Referrer Activation Credits"
            configKey="referral.referrer_activation_credits"
            value={referrals.config.referrer_activation_credits}
            onSave={handleConfigSave}
          />
        </SectionCard>

        <SectionCard title="Top Referrers">
          {referrals.top_referrers.length === 0 ? (
            <p className="text-sm text-[#999]">No referrers yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[#999] border-b border-[#eaeaea] dark:border-[#333]">
                    <th className="pb-2 font-medium">Name</th>
                    <th className="pb-2 font-medium">Email</th>
                    <th className="pb-2 font-medium text-right">Referrals</th>
                    <th className="pb-2 font-medium text-right">Credits</th>
                  </tr>
                </thead>
                <tbody>
                  {referrals.top_referrers.map((r) => (
                    <tr key={r.user_id} className="border-b border-[#eaeaea] dark:border-[#333] last:border-0">
                      <td className="py-2 text-black dark:text-white">{r.name}</td>
                      <td className="py-2 text-[#666] dark:text-[#888]">{r.email}</td>
                      <td className="py-2 text-right text-black dark:text-white">{r.referral_count}</td>
                      <td className="py-2 text-right text-black dark:text-white">{r.credits_earned}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    );
  };

  const renderGamification = () => {
    if (loading || !gamification) return <LoadingSpinner />;

    // Group badges by category
    const badgesByCategory: Record<string, BadgeDefinition[]> = {};
    for (const badge of allBadges) {
      const cat = badge.category || 'other';
      if (!badgesByCategory[cat]) badgesByCategory[cat] = [];
      badgesByCategory[cat].push(badge);
    }

    // Merge admin configs with frontend defaults
    const badgeConfig = gamification.badge_config || {};
    const streakConfig = gamification.streak_config || {};
    const rewardConfig = gamification.reward_config || {};

    return (
      <div>
        {/* Master Toggle */}
        <SectionCard title="Gamification System">
          <ToggleSwitch
            enabled={gamification.enabled}
            onChange={(v) => handleToggle('gamification.enabled', v)}
            label="Enable Gamification"
          />
          {!gamification.enabled && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              Gamification is off — users won't earn badges or streaks
            </p>
          )}
        </SectionCard>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <MetricCard label="Total Badges Earned" value={gamification.badge_stats?.total_earned ?? 0} />
          <MetricCard label="Active Streaks" value={gamification.streak_stats?.active_streaks ?? 0} sublabel={`Avg streak: ${gamification.streak_stats?.avg_streak ?? 0} days`} />
          <MetricCard label="Badge Types" value={allBadges.length} sublabel={`${allBadges.filter(b => b.earned).length} earned by you`} />
          <MetricCard label="Categories" value={Object.keys(badgesByCategory).length} />
        </div>

        {/* ===== Badges by Category ===== */}
        {Object.entries(badgesByCategory).map(([category, badges]) => {
          const catLabel = CATEGORY_LABELS[category] || category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          const catColor = CATEGORY_COLORS[category] || 'text-[#666]';

          return (
            <SectionCard key={category} title={`${catLabel} Badges`}>
              <div className="space-y-0">
                {badges.map((badge) => {
                  const Icon = BADGE_ICON_MAP[badge.icon] || Award;
                  const configValue = badgeConfig[badge.badge_type];
                  const displayCredits = configValue ?? badge.credits;

                  return (
                    <div key={badge.badge_type} className="flex items-center gap-3 py-2.5 border-b border-[#eaeaea] dark:border-[#333] last:border-0">
                      {/* Icon */}
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-[#f5f5f5] dark:bg-[#1a1a1a] shrink-0`}>
                        <Icon className={`w-4 h-4 ${catColor}`} />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-black dark:text-white truncate">{badge.name}</span>
                          {badge.earned && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium">Earned</span>
                          )}
                        </div>
                        <p className="text-xs text-[#666] dark:text-[#888] truncate">{badge.description}</p>
                      </div>

                      {/* Editable credits */}
                      <div className="shrink-0">
                        <InlineCreditsEditor
                          configKey={`badges.credits.${badge.badge_type}`}
                          value={displayCredits}
                          onSave={handleConfigSave}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          );
        })}

        {/* Fallback: show raw badge_config if no badge definitions fetched */}
        {allBadges.length === 0 && Object.keys(badgeConfig).length > 0 && (
          <SectionCard title="Badge Credit Config">
            {Object.entries(badgeConfig).map(([badge, credits]) => (
              <ConfigRow
                key={badge}
                label={badge.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                configKey={`badges.credits.${badge}`}
                value={credits}
                onSave={handleConfigSave}
              />
            ))}
          </SectionCard>
        )}

        {/* ===== Streak Milestones ===== */}
        <SectionCard title="Streak Milestones">
          <p className="text-xs text-[#999] mb-3">
            Users earn credits for maintaining consecutive daily creation streaks. The flame icon grows larger at each tier.
          </p>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-[#fafafa] dark:bg-[#0a0a0a] rounded-lg p-3 text-center border border-[#eaeaea] dark:border-[#333]">
              <Flame className="w-5 h-5 text-orange-400 mx-auto mb-1" />
              <div className="text-xs text-[#999]">1-2 days</div>
              <div className="text-[10px] text-[#bbb]">Small flame</div>
            </div>
            <div className="bg-[#fafafa] dark:bg-[#0a0a0a] rounded-lg p-3 text-center border border-[#eaeaea] dark:border-[#333]">
              <Flame className="w-6 h-6 text-red-500 mx-auto mb-1" />
              <div className="text-xs text-[#999]">7-29 days</div>
              <div className="text-[10px] text-[#bbb]">Large flame</div>
            </div>
            <div className="bg-[#fafafa] dark:bg-[#0a0a0a] rounded-lg p-3 text-center border border-[#eaeaea] dark:border-[#333]">
              <Flame className="w-7 h-7 text-yellow-400 mx-auto mb-1" />
              <div className="text-xs text-[#999]">30+ days</div>
              <div className="text-[10px] text-[#bbb]">Legendary</div>
            </div>
          </div>
          {STREAK_MILESTONES.map((m) => (
            <ConfigRow
              key={m.days}
              label={`${m.days}-day streak reward`}
              configKey={m.configKey}
              value={streakConfig[m.responseKey] ?? m.defaultCredits}
              onSave={handleConfigSave}
            />
          ))}
        </SectionCard>

        {/* ===== Reward Modal Presets ===== */}
        <SectionCard title="Token Reward Amounts">
          <p className="text-xs text-[#999] mb-3">
            Configure token amounts for reward modals shown to users on key events.
          </p>
          {REWARD_PRESETS.map((preset) => (
            <ConfigRow
              key={preset.key}
              label={preset.label}
              configKey={preset.key}
              value={rewardConfig[preset.responseKey] ?? preset.defaultAmount}
              onSave={handleConfigSave}
            />
          ))}
        </SectionCard>

        {/* ===== Leaderboard Preview ===== */}
        <SectionCard title="Leaderboard Preview (Top 5)">
          {(gamification.leaderboard_preview || []).length === 0 ? (
            <p className="text-sm text-[#999]">No leaderboard data</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[#999] border-b border-[#eaeaea] dark:border-[#333]">
                    <th className="pb-2 font-medium">Rank</th>
                    <th className="pb-2 font-medium">Name</th>
                    <th className="pb-2 font-medium text-right">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {(gamification.leaderboard_preview || []).slice(0, 5).map((entry) => (
                    <tr key={entry.rank} className="border-b border-[#eaeaea] dark:border-[#333] last:border-0">
                      <td className="py-2 text-[#666] dark:text-[#888]">#{entry.rank}</td>
                      <td className="py-2 text-black dark:text-white">{entry.name}</td>
                      <td className="py-2 text-right text-black dark:text-white">{entry.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {/* ===== Preview Notifications ===== */}
        <SectionCard title="Preview Notifications">
          <p className="text-xs text-[#999] mb-3">
            Trigger sample notifications to see what users experience when earning badges or rewards.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => showBadgeUnlock({
                badge_type: 'first_deck',
                name: 'First Creation',
                description: 'Created your first presentation',
                icon: 'sparkles',
                credits: badgeConfig['first_deck'] ?? 10,
              })}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-[#eaeaea] dark:border-[#333] bg-white dark:bg-[#0a0a0a] text-black dark:text-white hover:border-[#FF4301] hover:text-[#FF4301] transition-colors"
            >
              <Play className="w-3 h-3" /> Badge Unlock
            </button>
            <button
              onClick={() => showBadgeUnlock({
                badge_type: 'streak_7',
                name: '7-Day Streak',
                description: 'Created presentations 7 days in a row',
                icon: 'flame',
                credits: streakConfig['7_day_credits'] ?? 25,
              })}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-[#eaeaea] dark:border-[#333] bg-white dark:bg-[#0a0a0a] text-black dark:text-white hover:border-[#FF4301] hover:text-[#FF4301] transition-colors"
            >
              <Play className="w-3 h-3" /> Streak Milestone
            </button>
            <button
              onClick={() => showReward({
                amount: rewardConfig['welcome_bonus'] ?? 450,
                title: 'A Token of Appreciation!',
                subtitle: "We're so grateful you're one of our early users. Here's a little gift to get you started.",
                message: 'Each slide costs 5 tokens. Create up to 90 slides!',
                buttonText: 'Start Creating',
                icon: 'gift',
              })}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-[#eaeaea] dark:border-[#333] bg-white dark:bg-[#0a0a0a] text-black dark:text-white hover:border-[#FF4301] hover:text-[#FF4301] transition-colors"
            >
              <Play className="w-3 h-3" /> Welcome Reward Modal
            </button>
          </div>
        </SectionCard>
      </div>
    );
  };

  const renderCommunity = () => {
    return <AdminCommunityPanel />;
  };

  const renderLeads = () => {
    return <AdminLeadsPanel />;
  };

  const handleBroadcast = async () => {
    if (!notifTitle.trim()) {
      toast({ title: 'Error', description: 'Title is required', variant: 'destructive' });
      return;
    }
    if (!notifMessage.trim()) {
      toast({ title: 'Error', description: 'Message is required', variant: 'destructive' });
      return;
    }
    setNotifSending(true);
    try {
      const result = await adminApi.broadcastNotification({
        title: notifTitle.trim(),
        message: notifMessage.trim(),
        image_url: notifImageUrl.trim() || undefined,
        target: notifTarget,
        notification_type: notifType,
      });
      toast({ title: 'Sent', description: `Notification sent to ${result.sent_to} user${result.sent_to !== 1 ? 's' : ''}` });
      setNotifTitle('');
      setNotifMessage('');
      setNotifImageUrl('');
      // Reload history
      const history = await adminApi.getNotificationHistory(1, 30).catch(() => ({ notifications: [], total: 0, page: 1, limit: 30, total_pages: 0 }));
      setNotifHistory(history.notifications);
      setNotifHistoryTotal(history.total);
      setNotifHistoryPage(1);
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to send notification', variant: 'destructive' });
    } finally {
      setNotifSending(false);
    }
  };

  const loadMoreHistory = async () => {
    const nextPage = notifHistoryPage + 1;
    try {
      const history = await adminApi.getNotificationHistory(nextPage, 30);
      setNotifHistory((prev) => [...prev, ...history.notifications]);
      setNotifHistoryPage(nextPage);
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to load more', variant: 'destructive' });
    }
  };

  const renderNotifications = () => {
    if (loading || !notifications) return <LoadingSpinner />;

    const NOTIF_TYPE_COLORS: Record<string, string> = {
      system: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      view: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      remix: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
      referral: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    };

    return (
      <div>
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <MetricCard label="Sent Last 7 Days" value={notifications.stats.total_last_7d} />
          <MetricCard
            label="By Type"
            value={Object.keys(notifications.stats.by_type).length}
            sublabel={Object.entries(notifications.stats.by_type).map(([k, v]) => `${k}: ${v}`).join(', ')}
          />
        </div>

        {/* Configuration */}
        <SectionCard title="Configuration">
          <ToggleSwitch
            enabled={notifications.config.enabled}
            onChange={(v) => handleToggle('notifications.enabled', v)}
            label="Enable Notifications"
          />
          <ToggleSwitch
            enabled={notifications.config.email_on_views}
            onChange={(v) => handleToggle('notifications.email_on_views', v)}
            label="Email on Views"
          />
          <ToggleSwitch
            enabled={notifications.config.weekly_digest_enabled}
            onChange={(v) => handleToggle('notifications.weekly_digest_enabled', v)}
            label="Weekly Digest"
          />
          <ConfigRow
            label="View Threshold"
            configKey="notifications.view_threshold"
            value={notifications.config.view_threshold}
            onSave={handleConfigSave}
          />
        </SectionCard>

        {/* ===== Notification Composer ===== */}
        <div className={cn(cardClass, "mb-4 overflow-hidden")}>
          <div className="p-5 border-b border-[#eaeaea] dark:border-[#333]">
            <h3 className="text-sm font-medium text-black dark:text-white">Compose Notification</h3>
            <p className="text-xs text-[#999] mt-0.5">Push an in-app notification to users</p>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: Form */}
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-[#666] dark:text-[#888] mb-1.5 block font-medium">Title</label>
                  <input
                    type="text"
                    value={notifTitle}
                    onChange={(e) => setNotifTitle(e.target.value)}
                    placeholder="New feature available"
                    className="w-full px-3 py-2 text-sm border border-[#ddd] dark:border-[#555] rounded-lg bg-white dark:bg-[#1a1a1a] text-black dark:text-white placeholder:text-[#bbb] dark:placeholder:text-[#555]"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#666] dark:text-[#888] mb-1.5 block font-medium">Message</label>
                  <textarea
                    value={notifMessage}
                    onChange={(e) => setNotifMessage(e.target.value)}
                    placeholder="We just launched carousel exports..."
                    rows={3}
                    className="w-full px-3 py-2 text-sm border border-[#ddd] dark:border-[#555] rounded-lg bg-white dark:bg-[#1a1a1a] text-black dark:text-white resize-none placeholder:text-[#bbb] dark:placeholder:text-[#555]"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#666] dark:text-[#888] mb-1.5 block font-medium">Image URL <span className="text-[#bbb]">(optional)</span></label>
                  <input
                    type="url"
                    value={notifImageUrl}
                    onChange={(e) => setNotifImageUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 text-sm border border-[#ddd] dark:border-[#555] rounded-lg bg-white dark:bg-[#1a1a1a] text-black dark:text-white placeholder:text-[#bbb] dark:placeholder:text-[#555]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-[#666] dark:text-[#888] mb-1.5 block font-medium">Target</label>
                    <select
                      value={notifTarget}
                      onChange={(e) => setNotifTarget(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-[#ddd] dark:border-[#555] rounded-lg bg-white dark:bg-[#1a1a1a] text-black dark:text-white"
                    >
                      <option value="all">All users</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-[#666] dark:text-[#888] mb-1.5 block font-medium">Type</label>
                    <select
                      value={notifType}
                      onChange={(e) => setNotifType(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-[#ddd] dark:border-[#555] rounded-lg bg-white dark:bg-[#1a1a1a] text-black dark:text-white"
                    >
                      <option value="system">System</option>
                      <option value="badge">Badge</option>
                      <option value="referral">Referral</option>
                    </select>
                  </div>
                </div>
                <button
                  onClick={handleBroadcast}
                  disabled={notifSending || !notifTitle.trim() || !notifMessage.trim()}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-[#FF4301] rounded-lg hover:bg-[#e63e00] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {notifSending ? 'Sending...' : 'Send Notification'}
                </button>
              </div>

              {/* Right: Live Preview */}
              <div>
                <label className="text-xs text-[#666] dark:text-[#888] mb-1.5 block font-medium">Preview</label>
                <div className="bg-[#fafafa] dark:bg-[#0a0a0a] border border-[#eaeaea] dark:border-[#333] rounded-xl p-4 min-h-[200px] flex items-start justify-center">
                  <div className="w-full max-w-sm">
                    <div className={`bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-xl overflow-hidden shadow-sm ${!notifTitle && !notifMessage ? 'opacity-40' : ''}`}>
                      {notifImageUrl && (
                        <div className="w-full h-32 bg-[#f0f0f0] dark:bg-[#222] overflow-hidden">
                          <img
                            src={notifImageUrl}
                            alt=""
                            className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        </div>
                      )}
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-[#FF4301]/10 flex items-center justify-center shrink-0 mt-0.5">
                            <div className="w-4 h-4 rounded-full bg-[#FF4301]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-black dark:text-white leading-tight">
                              {notifTitle || 'Notification title'}
                            </p>
                            <p className="text-xs text-[#666] dark:text-[#888] mt-1 leading-relaxed">
                              {notifMessage || 'Notification message will appear here...'}
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${NOTIF_TYPE_COLORS[notifType] || NOTIF_TYPE_COLORS.system}`}>
                                {notifType}
                              </span>
                              <span className="text-[10px] text-[#bbb]">Just now</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ===== Send Test Email ===== */}
        <SectionCard title="Send Test Email">
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs text-[#666] dark:text-[#888] mb-1 block">Email Address</label>
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="test@example.com"
                className="w-full px-3 py-2 text-sm border border-[#ddd] dark:border-[#555] rounded bg-white dark:bg-[#222] text-black dark:text-white"
              />
            </div>
            <div>
              <label className="text-xs text-[#666] dark:text-[#888] mb-1 block">Template</label>
              <select
                value={testTemplate}
                onChange={(e) => setTestTemplate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[#ddd] dark:border-[#555] rounded bg-white dark:bg-[#222] text-black dark:text-white"
              >
                <option value="weekly_digest">Weekly Digest</option>
                <option value="view_milestone">View Milestone</option>
                <option value="streak_reminder">Streak Reminder</option>
                <option value="referral_signup">Referral Signup</option>
              </select>
            </div>
            <button
              onClick={handleSendTestEmail}
              className="self-start px-4 py-2 text-sm font-medium text-white bg-[#FF4301] rounded hover:bg-[#e63e00] transition-colors"
            >
              Send Test Email
            </button>
          </div>
        </SectionCard>

        {/* ===== Notification History ===== */}
        <div className={cn(cardClass, "overflow-hidden")}>
          <div className="p-5 border-b border-[#eaeaea] dark:border-[#333] flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-black dark:text-white">History</h3>
              <p className="text-xs text-[#999] mt-0.5">{notifHistoryTotal} total notification{notifHistoryTotal !== 1 ? 's' : ''}</p>
            </div>
          </div>
          {notifHistory.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-[#999]">No notifications sent yet</div>
          ) : (
            <div className="divide-y divide-[#eaeaea] dark:divide-[#333]">
              {notifHistory.map((n) => {
                const isExpanded = expandedNotifId === n.id;
                const createdDate = new Date(n.created_at);
                const timeAgo = getRelativeTime(createdDate);
                return (
                  <div key={n.id}>
                    <button
                      onClick={() => setExpandedNotifId(isExpanded ? null : n.id)}
                      className="w-full text-left px-5 py-3 hover:bg-[#fafafa] dark:hover:bg-[#0a0a0a] transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-black dark:text-white truncate">{n.title}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${NOTIF_TYPE_COLORS[n.type] || NOTIF_TYPE_COLORS.system}`}>
                              {n.type}
                            </span>
                          </div>
                          <p className="text-xs text-[#999] truncate mt-0.5">{n.message}</p>
                        </div>
                        <span className="text-[11px] text-[#bbb] shrink-0">{timeAgo}</span>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="px-5 pb-4">
                        <div className="bg-[#fafafa] dark:bg-[#0a0a0a] border border-[#eaeaea] dark:border-[#333] rounded-xl p-4 max-w-sm">
                          <div className={`bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-xl overflow-hidden shadow-sm`}>
                            {n.data?.image_url && (
                              <div className="w-full h-32 bg-[#f0f0f0] dark:bg-[#222] overflow-hidden">
                                <img src={n.data.image_url} alt="" className="w-full h-full object-cover" />
                              </div>
                            )}
                            <div className="p-4">
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-lg bg-[#FF4301]/10 flex items-center justify-center shrink-0 mt-0.5">
                                  <div className="w-4 h-4 rounded-full bg-[#FF4301]" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-black dark:text-white leading-tight">{n.title}</p>
                                  <p className="text-xs text-[#666] dark:text-[#888] mt-1 leading-relaxed">{n.message}</p>
                                  <div className="flex items-center gap-2 mt-2">
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${NOTIF_TYPE_COLORS[n.type] || NOTIF_TYPE_COLORS.system}`}>
                                      {n.type}
                                    </span>
                                    <span className="text-[10px] text-[#bbb]">
                                      {createdDate.toLocaleDateString()} {createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {notifHistory.length < notifHistoryTotal && (
            <div className="p-3 border-t border-[#eaeaea] dark:border-[#333] text-center">
              <button onClick={loadMoreHistory} className="text-xs text-[#FF4301] hover:underline font-medium">
                Load more
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSeo = () => {
    return (
      <div>
        <SectionCard title="SEO & Landing Pages">
          <ToggleSwitch
            enabled={true}
            onChange={(v) => handleToggle('seo.landing_pages_enabled', v)}
            label="Landing Pages Enabled"
          />
          <ToggleSwitch
            enabled={true}
            onChange={(v) => handleToggle('seo.template_gallery_enabled', v)}
            label="Template Gallery Enabled"
          />
        </SectionCard>
      </div>
    );
  };

  const renderEnterprise = () => {
    if (loading || !pqa) return <LoadingSpinner />;
    return (
      <div>
        <div className="grid grid-cols-2 gap-3 mb-6">
          <MetricCard label="Total Domains" value={pqa.config ? stats?.pqa?.total_domains ?? '-' : '-'} />
          <MetricCard label="PQA Domains" value={stats?.pqa?.pqa_domains ?? '-'} />
        </div>

        <SectionCard title="Configuration">
          <ConfigRow
            label="PQA Threshold"
            configKey="pqa.threshold"
            value={pqa.config.threshold}
            onSave={handleConfigSave}
          />
          <ToggleSwitch
            enabled={pqa.config.enabled}
            onChange={(v) => handleToggle('pqa.enabled', v)}
            label="Enable PQA Detection"
          />
        </SectionCard>

        <SectionCard title="Top PQA Domains">
          {pqa.domains.length === 0 ? (
            <p className="text-sm text-[#999]">No domains tracked yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[#999] border-b border-[#eaeaea] dark:border-[#333]">
                    <th className="pb-2 font-medium">Domain</th>
                    <th className="pb-2 font-medium text-right">Users</th>
                    <th className="pb-2 font-medium text-right">Decks</th>
                    <th className="pb-2 font-medium text-center">PQA</th>
                    <th className="pb-2 font-medium text-center">Notified</th>
                  </tr>
                </thead>
                <tbody>
                  {pqa.domains.map((d) => (
                    <tr key={d.domain} className="border-b border-[#eaeaea] dark:border-[#333] last:border-0">
                      <td className="py-2 text-black dark:text-white font-mono text-xs">{d.domain}</td>
                      <td className="py-2 text-right text-black dark:text-white">{d.user_count}</td>
                      <td className="py-2 text-right text-black dark:text-white">{d.total_decks}</td>
                      <td className="py-2 text-center">
                        <span className={`inline-block w-2 h-2 rounded-full ${d.is_pqa ? 'bg-green-500' : 'bg-[#ddd] dark:bg-[#444]'}`} />
                      </td>
                      <td className="py-2 text-center">
                        <span className={`inline-block w-2 h-2 rounded-full ${d.notified ? 'bg-blue-500' : 'bg-[#ddd] dark:bg-[#444]'}`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    );
  };

  const renderViral = () => {
    if (loading || !viral) return <LoadingSpinner />;
    return (
      <div>
        <div className="grid grid-cols-3 gap-3 mb-6">
          <MetricCard label="Shared Decks" value={viral.stats.shared_decks} />
          <MetricCard label="Embeds" value={viral.stats.embeds} />
          <MetricCard label="Badge Impressions" value={viral.stats.badge_impressions} />
        </div>

        <SectionCard title="Configuration">
          <ToggleSwitch
            enabled={viral.config.badge_enabled}
            onChange={(v) => handleToggle('viral.badge_enabled', v)}
            label="Badge Enabled"
          />
          <ToggleSwitch
            enabled={viral.config.embed_enabled}
            onChange={(v) => handleToggle('viral.embed_enabled', v)}
            label="Embed Enabled"
          />
          <ToggleSwitch
            enabled={viral.config.og_previews_enabled}
            onChange={(v) => handleToggle('viral.og_previews_enabled', v)}
            label="OG Previews Enabled"
          />
        </SectionCard>
      </div>
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'referrals': return renderReferrals();
      case 'gamification': return renderGamification();
      case 'community': return renderCommunity();
      case 'leads': return renderLeads();
      case 'notifications': return renderNotifications();
      case 'seo': return renderSeo();
      case 'enterprise': return renderEnterprise();
      case 'viral': return renderViral();
      default: return null;
    }
  };

  return (
    <AdminLayoutV2>
      <div className="max-w-6xl mx-auto">
        {/* ── Page header ── */}
        <div className="mb-4">
          <h1 className="text-sm font-bold uppercase tracking-wider" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>Growth</h1>
          <p className="text-xs text-[#666] dark:text-[#888] mt-0.5">Referrals, gamification, notifications, and viral features</p>
        </div>

        {/* Overview Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
            <MetricCard label="Referral Signups" value={stats.referrals?.total_signups ?? 0} />
            <MetricCard label="Badges Earned" value={stats.gamification?.total_badges_earned ?? 0} />
            <MetricCard label="Community Pending" value={stats.community?.pending ?? 0} />
            <MetricCard label="Notifications (7d)" value={stats.notifications?.sent_last_7d ?? 0} />
            <MetricCard label="PQA Domains" value={stats.pqa?.pqa_domains ?? 0} />
            <MetricCard label="Shared Decks" value={stats.viral?.shared_decks ?? 0} />
          </div>
        )}

        {/* ── Tab Navigation ── */}
        <div className="border-b border-[#eaeaea] dark:border-[#333] mb-4">
          <div className="flex gap-0 -mb-px overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-2 text-[11px] font-medium border-b-2 whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'border-[#FF4301] text-[#FF4301]'
                    : 'border-transparent text-[#666] dark:text-[#888] hover:text-black dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        {renderTabContent()}
      </div>
    </AdminLayoutV2>
  );
};

export default AdminGrowth;
