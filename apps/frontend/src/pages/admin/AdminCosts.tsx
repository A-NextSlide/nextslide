import React, { useState, useEffect, useMemo } from 'react';
import AdminLayoutV2 from '@/components/admin/AdminLayoutV2';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useFinancialActuals, useUsagePatterns, useAdminOverview } from '@/hooks/useAdminQueries';
import { useAdminData } from '@/context/AdminDataContext';
import {
  fmtMoney, fmtNum, calcOpCost, MODEL_COSTS, OP_TOKENS, DEFAULT_PLANS, DEFAULT_INPUTS,
  calcTokensPerDeck, calcCostPerDeck, calcBlendedARPU, calcBlendedActualDecksPerPaidUser,
  calcProPlusPct, calcBlendedDecksPerOverageUser, calcEffectivePaidConversionPct,
  type PlanConfig, type EconomicsInputs, type MonthlyUserBreakdown, type EnterpriseConfig,
} from '@/utils/costModelCalculations';
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, ReferenceLine, Legend,
} from 'recharts';
import {
  RefreshCw, Loader2, DollarSign, Users, TrendingUp, Target, Zap, Globe, Share2,
  MessageSquare, Mail, Megaphone, Search, Rocket, RotateCcw, ChevronRight,
  ArrowUpRight, ArrowDownRight, Award, BarChart3, PieChart as PieChartIcon,
  ChevronUp, ChevronDown,
} from 'lucide-react';

// ════════════════════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════════════════════

type TabId = 'overview' | 'revenue' | 'costs' | 'growth' | 'projections' | 'benchmarks';

interface GrowthChannel {
  id: string;
  name: string;
  icon: React.ReactNode;
  pctOfSignups: number;
  cac: number;
  convToPaid: number;
  color: string;
}

interface ViralModel {
  sharesPerUserMonth: number;
  viewsPerShare: number;
  clickThroughRate: number;
  signupRate: number;
  referralBoost: number;
}

interface FunnelStage {
  name: string;
  rate: number;
}

interface GeminiFlashModel {
  costPerDeck: number;
  typingRate: number;
  completionRate: number;
  signupRate: number;
}

interface ExpenseDefaults {
  headcount: number;
  avgSalary: number;
  render: number;
  supabase: number;
  serpapi: number;
  stripePct: number;
  other: number;
}

// ════════════════════════════════════════════════════════════════════════════════
// CONSTANTS & DEFAULTS
// ════════════════════════════════════════════════════════════════════════════════

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <BarChart3 className="h-3 w-3" /> },
  { id: 'revenue', label: 'Revenue', icon: <DollarSign className="h-3 w-3" /> },
  { id: 'costs', label: 'Costs', icon: <PieChartIcon className="h-3 w-3" /> },
  { id: 'growth', label: 'Growth & PLG', icon: <Rocket className="h-3 w-3" /> },
  { id: 'projections', label: 'Projections', icon: <TrendingUp className="h-3 w-3" /> },
  { id: 'benchmarks', label: 'Benchmarks', icon: <Award className="h-3 w-3" /> },
];

const MONTH_LABELS = ['Now', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11', 'M12'];

const DEFAULT_ENTERPRISE: EnterpriseConfig = { dealsPerYear: 1, avgDealSize: 5000, dealMonths: [] };

const DEFAULT_EXPENSE_RATES: ExpenseDefaults = {
  headcount: 2, avgSalary: 0, render: 25, supabase: 25, serpapi: 50, stripePct: 2.9, other: 75,
};

const DEFAULT_CHANNELS: GrowthChannel[] = [
  { id: 'seo', name: 'Organic SEO', icon: <Search className="h-3 w-3" />, pctOfSignups: 20, cac: 0, convToPaid: 4, color: '#10b981' },
  { id: 'plg', name: 'Landing Page PLG', icon: <Zap className="h-3 w-3" />, pctOfSignups: 25, cac: 0.05, convToPaid: 10, color: '#3b82f6' },
  { id: 'viral', name: 'Viral / Social', icon: <Share2 className="h-3 w-3" />, pctOfSignups: 15, cac: 0, convToPaid: 7, color: '#8b5cf6' },
  { id: 'referral', name: 'Referral Program', icon: <Users className="h-3 w-3" />, pctOfSignups: 5, cac: 2, convToPaid: 14, color: '#f97316' },
  { id: 'community', name: 'Community', icon: <Globe className="h-3 w-3" />, pctOfSignups: 8, cac: 0, convToPaid: 5, color: '#ec4899' },
  { id: 'slack', name: 'Slack Integration', icon: <MessageSquare className="h-3 w-3" />, pctOfSignups: 5, cac: 0, convToPaid: 12, color: '#6366f1' },
  { id: 'paid', name: 'Paid Ads', icon: <Megaphone className="h-3 w-3" />, pctOfSignups: 10, cac: 20, convToPaid: 4, color: '#ef4444' },
  { id: 'email', name: 'Email / Outbound', icon: <Mail className="h-3 w-3" />, pctOfSignups: 4, cac: 5, convToPaid: 8, color: '#f59e0b' },
  { id: 'influencer', name: 'Influencer / Creator', icon: <Award className="h-3 w-3" />, pctOfSignups: 5, cac: 15, convToPaid: 6, color: '#14b8a6' },
  { id: 'producthunt', name: 'Product Hunt', icon: <Rocket className="h-3 w-3" />, pctOfSignups: 3, cac: 0, convToPaid: 8, color: '#da552f' },
];

const DEFAULT_VIRAL: ViralModel = { sharesPerUserMonth: 3, viewsPerShare: 15, clickThroughRate: 6, signupRate: 18, referralBoost: 12 };

const DEFAULT_FUNNEL: FunnelStage[] = [
  { name: 'Monthly Visitors', rate: 100 },
  { name: 'Signed Up', rate: 12 },
  { name: 'Activated (created deck)', rate: 75 },
  { name: 'Hit usage limit', rate: 55 },
  { name: 'Converted to paid', rate: 22 },
];

const DEFAULT_GEMINI_FLASH: GeminiFlashModel = { costPerDeck: 0.05, typingRate: 35, completionRate: 88, signupRate: 65 };

const BENCHMARK_DATA = [
  { company: 'Loveable', freeToPaid: 7, grossMargin: 55, ltvCac: 10, viral: 0.8, nrr: 115, payback: 1 },
  { company: 'Canva', freeToPaid: 4, grossMargin: 75, ltvCac: 4.5, viral: 0.4, nrr: 115, payback: 10 },
  { company: 'Gamma', freeToPaid: 6, grossMargin: 70, ltvCac: 3.2, viral: 0.35, nrr: 108, payback: 14 },
  { company: 'Tome', freeToPaid: 3, grossMargin: 65, ltvCac: 2.8, viral: 0.25, nrr: 105, payback: 16 },
  { company: 'Beautiful.ai', freeToPaid: 5, grossMargin: 72, ltvCac: 3.5, viral: 0.2, nrr: 110, payback: 12 },
  { company: 'Pitch', freeToPaid: 4, grossMargin: 68, ltvCac: 3.0, viral: 0.3, nrr: 112, payback: 13 },
];

const INDUSTRY_BENCHMARKS = { freeToPaid: 5, grossMargin: 75, ltvCac: 3, viral: 0.3, nrr: 110, payback: 12 };

type ScenarioId = 'aggressive' | 'conservative' | 'viral' | 'custom';

interface ScenarioPreset {
  label: string;
  inputs: Partial<EconomicsInputs>;
  enterprise: { dealsPerYear: number; avgDealSize: number };
  viral: ViralModel;
  funnel: FunnelStage[];
  channels: Partial<Record<string, Partial<GrowthChannel>>>;
  visitorBaseline: number;
}

const SCENARIOS: Record<Exclude<ScenarioId, 'custom'>, ScenarioPreset> = {
  conservative: {
    label: 'Conservative',
    inputs: {
      monthlyGrowthPct: 10, churnPct: 5, paidConversionPct: 2, freeToPayConvPct: 8,
      cac: 8, paidAcquisitionPct: 15, starterUpgradePct: 12, overageEnabled: false,
    },
    enterprise: { dealsPerYear: 0, avgDealSize: 5000 },
    viral: { sharesPerUserMonth: 2, viewsPerShare: 10, clickThroughRate: 4, signupRate: 12, referralBoost: 8 },
    funnel: [
      { name: 'Monthly Visitors', rate: 100 }, { name: 'Signed Up', rate: 8 },
      { name: 'Activated (created deck)', rate: 60 }, { name: 'Hit usage limit', rate: 35 },
      { name: 'Converted to paid', rate: 14 },
    ],
    channels: {},
    visitorBaseline: 10000,
  },
  aggressive: {
    label: 'Aggressive Launch',
    inputs: {
      monthlyGrowthPct: 25, churnPct: 8, paidConversionPct: 3, freeToPayConvPct: 12,
      cac: 12, paidAcquisitionPct: 30, starterUpgradePct: 18, overageEnabled: true,
    },
    enterprise: { dealsPerYear: 1, avgDealSize: 5000 },
    viral: DEFAULT_VIRAL,
    funnel: DEFAULT_FUNNEL,
    channels: {},
    visitorBaseline: 50000,
  },
  viral: {
    label: 'Viral Breakout',
    inputs: {
      monthlyGrowthPct: 40, churnPct: 10, paidConversionPct: 4, freeToPayConvPct: 15,
      cac: 5, paidAcquisitionPct: 10, starterUpgradePct: 25, overageEnabled: true,
    },
    enterprise: { dealsPerYear: 2, avgDealSize: 8000 },
    viral: { sharesPerUserMonth: 5, viewsPerShare: 25, clickThroughRate: 8, signupRate: 22, referralBoost: 18 },
    funnel: [
      { name: 'Monthly Visitors', rate: 100 }, { name: 'Signed Up', rate: 16 },
      { name: 'Activated (created deck)', rate: 80 }, { name: 'Hit usage limit', rate: 60 },
      { name: 'Converted to paid', rate: 28 },
    ],
    channels: {},
    visitorBaseline: 100000,
  },
};

// ════════════════════════════════════════════════════════════════════════════════
// STORAGE HELPERS
// ════════════════════════════════════════════════════════════════════════════════

const SK = {
  inputs: 'admin_costs_v2_inputs', plans: 'admin_costs_v2_plans', enterprise: 'admin_costs_v2_enterprise',
  channels: 'admin_costs_v2_channels', viral: 'admin_costs_v2_viral', funnel: 'admin_costs_v2_funnel',
  gemini: 'admin_costs_v2_gemini', expenses: 'admin_costs_v2_expenses', expenseRates: 'admin_costs_v2_expense_rates',
  userBreakdown: 'admin_costs_v2_user_breakdown', tab: 'admin_costs_v2_tab',
  chartOpen: 'admin_costs_v2_chart_open', chartSize: 'admin_costs_v2_chart_size',
  scenario: 'admin_costs_v2_scenario',
} as const;

function load<T>(key: string, fb: T): T {
  try {
    const s = localStorage.getItem(key);
    if (s) { const p = JSON.parse(s); return Array.isArray(fb) ? (Array.isArray(p) ? p : fb) : { ...fb, ...p }; }
  } catch { /* fallback */ }
  return fb;
}
function save(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* */ } }

// Design tokens
const hk = { fontFamily: '"HK Grotesk Wide", sans-serif' };
const sH = "text-[10px] font-bold uppercase tracking-wider text-[#FF4301]";
const cd = "bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-xl";

// ════════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════════

const AdminCosts: React.FC = () => {
  const { dateRange } = useAdminData();
  const { data: actuals, isLoading, refetch } = useFinancialActuals(dateRange.startDate, dateRange.endDate);
  const { data: patterns } = useUsagePatterns(dateRange.startDate, dateRange.endDate);
  const { data: overview } = useAdminOverview(dateRange.startDate, dateRange.endDate);

  const [activeTab, setActiveTab] = useState<TabId>(() => (localStorage.getItem(SK.tab) as TabId) || 'overview');
  const [inputs, setInputs] = useState<EconomicsInputs>(() => load(SK.inputs, DEFAULT_INPUTS));
  const [plans, setPlans] = useState<PlanConfig[]>(() => load(SK.plans, DEFAULT_PLANS));
  const [enterprise, setEnterprise] = useState<EnterpriseConfig>(() => load(SK.enterprise, DEFAULT_ENTERPRISE));
  const [channels, setChannels] = useState<GrowthChannel[]>(() => {
    const stored = load(SK.channels, DEFAULT_CHANNELS);
    // React elements (icons) can't survive JSON serialization — restore from defaults
    return stored.map((ch: any) => ({
      ...ch,
      icon: DEFAULT_CHANNELS.find(dc => dc.id === ch.id)?.icon || DEFAULT_CHANNELS[0]?.icon,
    }));
  });
  const [viral, setViral] = useState<ViralModel>(() => load(SK.viral, DEFAULT_VIRAL));
  const [funnel, setFunnel] = useState<FunnelStage[]>(() => load(SK.funnel, DEFAULT_FUNNEL));
  const [geminiFlash, setGeminiFlash] = useState<GeminiFlashModel>(() => load(SK.gemini, DEFAULT_GEMINI_FLASH));
  const [expenseRates, setExpenseRates] = useState<ExpenseDefaults>(() => load(SK.expenseRates, DEFAULT_EXPENSE_RATES));
  const [userBreakdown, setUserBreakdown] = useState<MonthlyUserBreakdown[]>([]);
  const [projectionMonths, setProjectionMonths] = useState(12);
  const [selectedMonth, setSelectedMonth] = useState(6);
  const [patternsApplied, setPatternsApplied] = useState(false);

  // Chart panel state
  const [chartOpen, setChartOpen] = useState(() => {
    const stored = localStorage.getItem(SK.chartOpen);
    return stored !== null ? stored === 'true' : true;
  });
  const [chartSize, setChartSize] = useState<'S' | 'M' | 'L'>(() => {
    const stored = localStorage.getItem(SK.chartSize);
    return (stored === 'S' || stored === 'M' || stored === 'L') ? stored : 'M';
  });
  const chartHeight = chartSize === 'S' ? 200 : chartSize === 'L' ? 400 : 300;

  // Scenario state
  const [activeScenario, setActiveScenario] = useState<ScenarioId>(() => {
    const stored = localStorage.getItem(SK.scenario);
    return (stored === 'aggressive' || stored === 'conservative' || stored === 'viral' || stored === 'custom') ? stored : 'aggressive';
  });
  const [scenarioJustApplied, setScenarioJustApplied] = useState(false);

  // Persist
  useEffect(() => { save(SK.inputs, inputs); }, [inputs]);
  useEffect(() => { save(SK.plans, plans); }, [plans]);
  useEffect(() => { save(SK.enterprise, enterprise); }, [enterprise]);
  useEffect(() => { save(SK.channels, channels.map(({ icon, ...rest }) => rest)); }, [channels]);
  useEffect(() => { save(SK.viral, viral); }, [viral]);
  useEffect(() => { save(SK.funnel, funnel); }, [funnel]);
  useEffect(() => { save(SK.gemini, geminiFlash); }, [geminiFlash]);
  useEffect(() => { save(SK.expenseRates, expenseRates); }, [expenseRates]);
  useEffect(() => { localStorage.setItem(SK.tab, activeTab); }, [activeTab]);
  useEffect(() => { if (userBreakdown.length > 0) save(SK.userBreakdown, userBreakdown); }, [userBreakdown]);
  useEffect(() => { localStorage.setItem(SK.chartOpen, String(chartOpen)); }, [chartOpen]);
  useEffect(() => { localStorage.setItem(SK.chartSize, chartSize); }, [chartSize]);
  useEffect(() => { localStorage.setItem(SK.scenario, activeScenario); }, [activeScenario]);

  // Real data
  const totalUsers = actuals?.users?.total || overview?.metrics?.users?.total || 5000;
  const realPaidUsers = actuals?.revenue?.paidUsers || 0;
  const realMRR = actuals?.revenue?.mrr || 0;

  useEffect(() => {
    if (patternsApplied) return;
    if (patterns) {
      setInputs(prev => ({
        ...prev,
        slidesPerDeck: Math.round(patterns.avgSlidesPerDeck) || prev.slidesPerDeck,
        editsPerDeck: Math.round(patterns.avgEditsPerDeck) || prev.editsPerDeck,
        researchCallsPerDeck: Math.round(patterns.avgResearchCallsPerDeck) || prev.researchCallsPerDeck,
        decksPerActiveUserMonth: Math.round(patterns.avgDecksPerUser) || prev.decksPerActiveUserMonth,
      }));
      setPatternsApplied(true);
    }
  }, [patterns, patternsApplied]);

  // Derived
  const tokensPerDeck = useMemo(() => calcTokensPerDeck(inputs), [inputs]);
  const routingCost = calcOpCost('routing');
  const costPerDeck = useMemo(() => calcCostPerDeck(inputs, routingCost), [inputs, routingCost]);
  const blendedARPU = useMemo(() => calcBlendedARPU(plans), [plans]);
  const proPlusPct = useMemo(() => calcProPlusPct(plans), [plans]);
  const blendedActualDecks = useMemo(() => calcBlendedActualDecksPerPaidUser(plans, tokensPerDeck, inputs), [plans, tokensPerDeck, inputs]);
  const blendedOverageDecks = useMemo(() => calcBlendedDecksPerOverageUser(plans, tokensPerDeck, proPlusPct), [plans, tokensPerDeck, proPlusPct]);
  const effectiveConvPct = useMemo(() => calcEffectivePaidConversionPct(inputs.paidConversionPct, inputs.freeToPayConvPct), [inputs.paidConversionPct, inputs.freeToPayConvPct]);

  // User scenario
  const manualScenario = useMemo(() => {
    const ng = (inputs.monthlyGrowthPct - inputs.churnPct) / 100;
    return MONTH_LABELS.map((month, i) => ({ month, users: i === 0 ? totalUsers : Math.round(totalUsers * Math.pow(1 + ng, i)), isManual: false }));
  }, [totalUsers, inputs.monthlyGrowthPct, inputs.churnPct]);

  useEffect(() => {
    if (manualScenario.length === 0) return;
    const sp = plans.find(p => p.name.toLowerCase().includes('starter')) || plans[0];
    const pp = plans.find(p => p.name.toLowerCase().includes('pro')) || plans[1];
    const tp = plans.find(p => p.name.toLowerCase().includes('team')) || plans[2];
    setUserBreakdown(prev => {
      if (prev.length > 0 && prev.some(b => b?.isManual)) return prev;
      return manualScenario.map((s, i) => {
        const paid = Math.round(s.users * (effectiveConvPct / 100));
        return {
          free: s.users - paid, starter: Math.round(paid * ((sp?.pctOfPaid || 70) / 100)),
          pro: Math.round(paid * ((pp?.pctOfPaid || 25) / 100)), team: Math.round(paid * ((tp?.pctOfPaid || 5) / 100)),
          enterprise: i === 0 ? 0 : Math.floor(enterprise.dealsPerYear * (i / 12)), oneOffSpend: 0, isManual: false,
        };
      });
    });
  }, [manualScenario, effectiveConvPct, plans, enterprise.dealsPerYear]);

  // Visitor baseline (scenario-driven)
  const [visitorBaseline, setVisitorBaseline] = useState(50000);
  useEffect(() => {
    if (scenarioJustApplied && activeScenario !== 'custom') {
      setVisitorBaseline(SCENARIOS[activeScenario].visitorBaseline);
    }
  }, [scenarioJustApplied, activeScenario]);

  // Funnel (moved before economics for dependency)
  const funnelData = useMemo(() => {
    const visitors = visitorBaseline;
    let cur = visitors;
    return funnel.map((s, i) => {
      if (i === 0) return { ...s, count: visitors, pct: 100 };
      cur = Math.round(cur * (s.rate / 100));
      return { ...s, count: cur, pct: (cur / visitors) * 100 };
    });
  }, [funnel, visitorBaseline]);

  // Gemini Flash (moved before economics for dependency)
  const geminiMetrics = useMemo(() => {
    const vis = funnelData[0]?.count || 10000;
    const typed = Math.round(vis * (geminiFlash.typingRate / 100));
    const gen = Math.round(typed * (geminiFlash.completionRate / 100));
    const signup = Math.round(gen * (geminiFlash.signupRate / 100));
    const tc = gen * geminiFlash.costPerDeck;
    return { typed, generated: gen, signedUp: signup, totalCost: tc, costPerSignup: signup > 0 ? tc / signup : 0 };
  }, [geminiFlash, funnelData]);

  // Economics
  const economics = useMemo(() => {
    const { decksPerActiveUserMonth, paidConversionPct, churnPct, cac, freeTokens,
      overageEnabled, overagePctOfProUsers, overagePricePerToken, avgOverageTokensPerUser,
      starterUpgradePct, freeTokenConsumptionPct, monthlyGrowthPct, paidAcquisitionPct } = inputs;
    const freeTokensUsed = freeTokens * (freeTokenConsumptionPct / 100);
    const freeDecksOneTime = tokensPerDeck > 0 ? freeTokensUsed / tokensPerDeck : 0;
    const paidDecks = Math.min(decksPerActiveUserMonth, blendedActualDecks);
    const directPaidPct = paidConversionPct / 100;
    const cb = userBreakdown[0] || { free: 0, starter: 0, pro: 0, team: 0, enterprise: 0 };
    const proPlusU = cb.pro + cb.team;
    const estPaidU = cb.starter + proPlusU;
    const activeProPlus = Math.ceil(proPlusU * 0.7);
    const organicSignups = Math.round(totalUsers * (monthlyGrowthPct / 100));
    const newSignups = organicSignups + geminiMetrics.signedUp;
    const newFree = Math.round(newSignups * (1 - directPaidPct));
    const freeTrialCost = newFree * freeDecksOneTime * costPerDeck;
    const proPlan = plans.find(p => p.name.toLowerCase().includes('pro')) || plans[1];
    const starterPlan = plans.find(p => p.name.toLowerCase().includes('starter')) || plans[0];
    const teamPlan = plans.find(p => p.name.toLowerCase().includes('team')) || plans[2];
    const upgradeU = Math.round(cb.starter * (starterUpgradePct / 100));
    const upgradeRev = proPlan && starterPlan ? upgradeU * (proPlan.price - starterPlan.price) : 0;
    const paidAcq = Math.round(newSignups * (paidAcquisitionPct / 100));
    const acqCost = paidAcq * cac;
    const activeStarter = Math.ceil(cb.starter * 0.7);
    const starterCost = activeStarter * paidDecks * costPerDeck;
    const overageU = overageEnabled ? Math.ceil(activeProPlus * (overagePctOfProUsers / 100)) : 0;
    const normalProPlus = activeProPlus - overageU;
    const normalCost = normalProPlus * paidDecks * costPerDeck;
    const overageBaseCost = overageU * blendedOverageDecks * costPerDeck;
    const overageTok = overageU * avgOverageTokensPerUser;
    const costTok = tokensPerDeck > 0 ? costPerDeck / tokensPerDeck : 0;
    const overageExtra = overageEnabled ? overageTok * costTok : 0;
    const entDecks = tokensPerDeck > 0 ? (5000 * (inputs.enterpriseTokenConsumptionPct / 100)) / tokensPerDeck : 0;
    const entCost = cb.enterprise * entDecks * costPerDeck;
    const geminiCost = geminiMetrics.totalCost;
    const totalCost = starterCost + normalCost + overageBaseCost + overageExtra + entCost + freeTrialCost + acqCost + geminiCost;
    const subRev = cb.starter * (starterPlan?.price || 9) + cb.pro * (proPlan?.price || 19) + cb.team * (teamPlan?.price || 49);
    const entRev = (enterprise.dealsPerYear * enterprise.avgDealSize) / 12;
    const overageRev = overageEnabled ? overageTok * overagePricePerToken : 0;
    const estMRR = subRev + overageRev + upgradeRev + entRev;
    const totalPaying = estPaidU + cb.enterprise;
    const grossMargin = estMRR > 0 ? ((estMRR - totalCost) / estMRR) * 100 : 0;
    const costPerPaid = totalPaying > 0 ? totalCost / totalPaying : 0;
    const revPerPaid = totalPaying > 0 ? estMRR / totalPaying : blendedARPU;
    const profitPerPaid = revPerPaid - costPerPaid;
    const avgLife = churnPct > 0 ? 100 / churnPct : 24;
    const ltv = revPerPaid * avgLife;
    const ltvCac = cac > 0 ? ltv / cac : 0;
    const breakEven = profitPerPaid > 0 ? Math.ceil(totalCost / profitPerPaid) : 0;
    const payback = cac > 0 && profitPerPaid > 0 ? cac / profitPerPaid : 99;
    return {
      costPerDeck, tokensPerDeck, freeDecksOneTime, paidDecksPerUserMonth: paidDecks,
      totalCost, estPaidUsers: totalPaying, freeUsers: cb.free, estMRR,
      subscriptionRevenue: subRev, overageRevenue: overageRev, enterpriseRevenue: entRev,
      grossMargin, ltv, ltvCac, effectivePaidConversionPct: effectiveConvPct,
      breakEvenPaidUsers: breakEven, paybackMonths: payback, netMonthly: estMRR - totalCost,
      costPerPaidUser: costPerPaid, profitPerPaidUser: profitPerPaid, blendedARPU: revPerPaid,
      freeTrialCostMonthly: freeTrialCost, newFreeTrialUsers: newFree, starterUsers: cb.starter,
      proPlusUsers: proPlusU, activeProPlusUsers: activeProPlus, overageUsers: overageU,
      overageTokensTotal: overageTok, upgradeRevenue: upgradeRev, starterUpgradeUsers: upgradeU,
      overageCost: overageExtra,
    };
  }, [inputs, costPerDeck, tokensPerDeck, totalUsers, blendedARPU, blendedActualDecks, blendedOverageDecks, plans, userBreakdown, enterprise, effectiveConvPct, geminiMetrics]);

  // Projections
  const projectionData = useMemo(() => {
    const { decksPerActiveUserMonth, overageEnabled, overagePctOfProUsers, overagePricePerToken,
      avgOverageTokensPerUser, starterUpgradePct, freeTokenConsumptionPct, paidConversionPct } = inputs;
    const paidDecks = Math.min(decksPerActiveUserMonth, blendedActualDecks);
    const proPlan = plans.find(p => p.name.toLowerCase().includes('pro')) || plans[1];
    const starterPlan = plans.find(p => p.name.toLowerCase().includes('starter')) || plans[0];
    const teamPlan = plans.find(p => p.name.toLowerCase().includes('team')) || plans[2];
    const upgDiff = proPlan && starterPlan ? proPlan.price - starterPlan.price : 0;
    let cumRev = 0, cumCost = 0;
    const data = [];
    for (let i = 0; i <= projectionMonths; i++) {
      const users = manualScenario[i]?.users || totalUsers;
      const prevU = i > 0 ? (manualScenario[i - 1]?.users || totalUsers) : 0;
      const newSig = i === 0 ? users : Math.max(0, users - prevU);
      const b = userBreakdown[i] || { free: 0, starter: 0, pro: 0, team: 0, enterprise: 0, oneOffSpend: 0 };
      const proPlusU = b.pro + b.team;
      const actStarter = Math.ceil(b.starter * 0.7);
      const actProPlus = Math.ceil(proPlusU * 0.7);
      const sCost = actStarter * paidDecks * costPerDeck;
      const ovU = overageEnabled ? Math.ceil(actProPlus * (overagePctOfProUsers / 100)) : 0;
      const nPP = actProPlus - ovU;
      const nCost = nPP * paidDecks * costPerDeck;
      const ovBase = ovU * blendedOverageDecks * costPerDeck;
      const ovTok = ovU * avgOverageTokensPerUser;
      const cTok = tokensPerDeck > 0 ? costPerDeck / tokensPerDeck : 0;
      const ovExtra = overageEnabled ? ovTok * cTok : 0;
      const eTok = 5000 * (inputs.enterpriseTokenConsumptionPct / 100);
      const eDecks = tokensPerDeck > 0 ? eTok / tokensPerDeck : 0;
      const eCost = b.enterprise * eDecks * costPerDeck;
      const newFr = Math.round(newSig * (1 - paidConversionPct / 100));
      const frUsed = inputs.freeTokens * (freeTokenConsumptionPct / 100);
      const frDecks = tokensPerDeck > 0 ? frUsed / tokensPerDeck : 0;
      const frCost = newFr * frDecks * costPerDeck;
      const paidAcq = Math.round(newSig * (inputs.paidAcquisitionPct / 100));
      const acqCost = paidAcq * inputs.cac;
      const apiCosts = sCost + nCost + ovBase + ovExtra + eCost + frCost + acqCost;
      const infraCosts = expenseRates.render + expenseRates.supabase;
      const serviceCosts = expenseRates.serpapi + expenseRates.other;
      const headcountCosts = expenseRates.headcount * expenseRates.avgSalary;
      const subRev = b.starter * (starterPlan?.price || 9) + b.pro * (proPlan?.price || 19) + b.team * (teamPlan?.price || 49);
      const prevEnt = i > 0 ? (userBreakdown[i - 1]?.enterprise || 0) : 0;
      const newDeals = Math.max(0, b.enterprise - prevEnt);
      const entRev = newDeals * enterprise.avgDealSize;
      const upgU = Math.round(b.starter * (starterUpgradePct / 100));
      const upgRev = upgU * upgDiff;
      const ovRev = overageEnabled ? ovTok * overagePricePerToken : 0;
      const monthRev = subRev + ovRev + upgRev + entRev;
      const stripeFees = monthRev * (expenseRates.stripePct / 100);
      const monthCosts = apiCosts + headcountCosts + infraCosts + serviceCosts + stripeFees;
      cumRev += monthRev; cumCost += monthCosts;
      data.push({
        month: MONTH_LABELS[i], monthIndex: i, users, paidUsers: b.starter + b.pro + b.team + b.enterprise,
        freeUsers: b.free, starterUsers: b.starter, proUsers: b.pro, teamUsers: b.team, enterpriseDeals: b.enterprise,
        revenue: monthRev, subscriptionRevenue: subRev, enterpriseRevenue: entRev, overageRevenue: ovRev,
        apiCosts, headcountCosts, infraCosts, serviceCosts, stripeFees,
        costs: monthCosts, profit: monthRev - monthCosts, cumRevenue: cumRev, cumCosts: cumCost, cumProfit: cumRev - cumCost,
      });
    }
    return data;
  }, [inputs, totalUsers, costPerDeck, tokensPerDeck, blendedActualDecks, blendedOverageDecks, projectionMonths, manualScenario, plans, userBreakdown, enterprise, expenseRates]);

  const selectedData = projectionData[selectedMonth] || projectionData[projectionData.length - 1];

  // Channel metrics
  const channelMetrics = useMemo(() => {
    const newSig = Math.round(totalUsers * (inputs.monthlyGrowthPct / 100));
    return channels.map(ch => {
      const signups = Math.round(newSig * (ch.pctOfSignups / 100));
      const paidUsers = Math.round(signups * (ch.convToPaid / 100));
      return { ...ch, signups, paidUsers, monthlyCost: signups * ch.cac };
    });
  }, [channels, totalUsers, inputs.monthlyGrowthPct]);

  const blendedCAC = useMemo(() => {
    const tc = channelMetrics.reduce((s, c) => s + c.monthlyCost, 0);
    const tp = channelMetrics.reduce((s, c) => s + c.paidUsers, 0);
    return tp > 0 ? tc / tp : 0;
  }, [channelMetrics]);

  const weightedConv = useMemo(() => channels.reduce((s, c) => s + (c.pctOfSignups / 100) * c.convToPaid, 0), [channels]);

  // Viral
  const viralCoeff = useMemo(() => {
    const base = viral.sharesPerUserMonth * viral.viewsPerShare * (viral.clickThroughRate / 100) * (viral.signupRate / 100);
    return base + viral.referralBoost / 100;
  }, [viral]);

  // Cost breakdown
  const costBreakdown = useMemo(() => {
    const items = [
      { name: 'Slides', cost: inputs.slidesPerDeck * inputs.apiCostPerSlide, color: '#FF4301' },
      { name: 'Theme', cost: inputs.apiCostPerTheme, color: '#f59e0b' },
      { name: 'Research', cost: inputs.researchCallsPerDeck * inputs.apiCostPerResearch, color: '#3b82f6' },
      { name: 'Edits', cost: inputs.editsPerDeck * inputs.apiCostPerEdit, color: '#8b5cf6' },
      { name: 'Routing', cost: 3 * routingCost, color: '#10b981' },
    ];
    const total = items.reduce((s, i) => s + i.cost, 0);
    return items.map(i => ({ ...i, pct: total > 0 ? (i.cost / total) * 100 : 0 }));
  }, [inputs, routingCost]);

  // Annual
  const annualMetrics = useMemo(() => {
    if (!selectedData) return { arr: 0, annualCosts: 0, annualProfit: 0, margin: 0 };
    const arr = selectedData.revenue * 12;
    const ac = selectedData.costs * 12;
    return { arr, annualCosts: ac, annualProfit: arr - ac, margin: arr > 0 ? ((arr - ac) / arr) * 100 : 0 };
  }, [selectedData]);

  // Benchmarks
  const benchmarkScores = useMemo(() => {
    const score = (val: number, bench: number, hb: boolean) => Math.min(100, Math.max(0, (hb ? val / bench : bench / val) * 60));
    const grade = (p: number) => {
      if (p >= 80) return { letter: 'A', color: '#10b981' };
      if (p >= 60) return { letter: 'B', color: '#3b82f6' };
      if (p >= 40) return { letter: 'C', color: '#f59e0b' };
      if (p >= 20) return { letter: 'D', color: '#f97316' };
      return { letter: 'F', color: '#ef4444' };
    };
    const nrrVal = 100 + (inputs.monthlyGrowthPct - inputs.churnPct);
    const metrics = [
      { name: 'Free→Paid', value: effectiveConvPct, benchmark: INDUSTRY_BENCHMARKS.freeToPaid, pct: score(effectiveConvPct, INDUSTRY_BENCHMARKS.freeToPaid, true), unit: '%' },
      { name: 'Gross Margin', value: economics.grossMargin, benchmark: INDUSTRY_BENCHMARKS.grossMargin, pct: score(economics.grossMargin, INDUSTRY_BENCHMARKS.grossMargin, true), unit: '%' },
      { name: 'LTV:CAC', value: economics.ltvCac, benchmark: INDUSTRY_BENCHMARKS.ltvCac, pct: score(economics.ltvCac, INDUSTRY_BENCHMARKS.ltvCac, true), unit: 'x' },
      { name: 'Viral Coeff', value: viralCoeff, benchmark: INDUSTRY_BENCHMARKS.viral, pct: score(viralCoeff, INDUSTRY_BENCHMARKS.viral, true), unit: '' },
      { name: 'Net Rev Ret', value: nrrVal, benchmark: INDUSTRY_BENCHMARKS.nrr, pct: score(nrrVal, INDUSTRY_BENCHMARKS.nrr, true), unit: '%' },
      { name: 'CAC Payback', value: economics.paybackMonths, benchmark: INDUSTRY_BENCHMARKS.payback, pct: economics.paybackMonths < 99 ? score(economics.paybackMonths, INDUSTRY_BENCHMARKS.payback, false) : 0, unit: 'mo' },
    ];
    return metrics.map(m => ({ ...m, grade: grade(m.pct) }));
  }, [effectiveConvPct, economics, viralCoeff, inputs.monthlyGrowthPct, inputs.churnPct]);

  // Sensitivity engine: recomputes key metrics with modified inputs
  const computeMetrics = useMemo(() => {
    return (ti: EconomicsInputs) => {
      const tpd = calcTokensPerDeck(ti);
      const rc = calcOpCost('routing');
      const cpd = calcCostPerDeck(ti, rc);
      const bad = calcBlendedActualDecksPerPaidUser(plans, tpd, ti);
      const ppp = calcProPlusPct(plans);
      const bod = calcBlendedDecksPerOverageUser(plans, tpd, ppp);
      const cb = userBreakdown[0] || { free: 0, starter: 0, pro: 0, team: 0, enterprise: 0 };
      const dp = ti.paidConversionPct / 100;
      const pd = Math.min(ti.decksPerActiveUserMonth, bad);
      const app = Math.ceil((cb.pro + cb.team) * 0.7);
      const ns = Math.round(totalUsers * (ti.monthlyGrowthPct / 100));
      const ftu = ti.freeTokens * (ti.freeTokenConsumptionPct / 100);
      const fdo = tpd > 0 ? ftu / tpd : 0;
      const ftc = Math.round(ns * (1 - dp)) * fdo * cpd;
      const sp = plans.find(p => p.name.toLowerCase().includes('starter')) || plans[0];
      const pp = plans.find(p => p.name.toLowerCase().includes('pro')) || plans[1];
      const tp = plans.find(p => p.name.toLowerCase().includes('team')) || plans[2];
      const ur = pp && sp ? Math.round(cb.starter * (ti.starterUpgradePct / 100)) * (pp.price - sp.price) : 0;
      const ac = Math.round(ns * (ti.paidAcquisitionPct / 100)) * ti.cac;
      const starterActive = Math.ceil(cb.starter * 0.7);
      const sc = starterActive * pd * cpd;
      const ou = ti.overageEnabled ? Math.ceil(app * (ti.overagePctOfProUsers / 100)) : 0;
      const nc = (app - ou) * pd * cpd;
      const obc = ou * bod * cpd;
      const ot = ou * ti.avgOverageTokensPerUser;
      const oe = ti.overageEnabled ? ot * (tpd > 0 ? cpd / tpd : 0) : 0;
      const ed = tpd > 0 ? (5000 * (ti.enterpriseTokenConsumptionPct / 100)) / tpd : 0;
      const ec = cb.enterprise * ed * cpd;
      const cost = sc + nc + obc + oe + ec + ftc + ac;
      const sr = cb.starter * (sp?.price || 9) + cb.pro * (pp?.price || 19) + cb.team * (tp?.price || 49);
      const er = (enterprise.dealsPerYear * enterprise.avgDealSize) / 12;
      const ovr = ti.overageEnabled ? ot * ti.overagePricePerToken : 0;
      const mrr = sr + ovr + ur + er;
      return { mrr, cost, profit: mrr - cost, margin: mrr > 0 ? ((mrr - cost) / mrr) * 100 : 0 };
    };
  }, [plans, userBreakdown, totalUsers, enterprise]);

  const sensitivity = useMemo(() => {
    const base = computeMetrics(inputs);
    const params: { key: keyof EconomicsInputs; label: string; category: string }[] = [
      { key: 'apiCostPerSlide', label: '$/Slide', category: 'COGS' },
      { key: 'apiCostPerEdit', label: '$/Edit', category: 'COGS' },
      { key: 'apiCostPerResearch', label: '$/Research', category: 'COGS' },
      { key: 'apiCostPerTheme', label: '$/Theme', category: 'COGS' },
      { key: 'monthlyGrowthPct', label: 'Growth %/mo', category: 'Growth' },
      { key: 'churnPct', label: 'Churn %/mo', category: 'Retention' },
      { key: 'cac', label: 'CAC', category: 'Acquisition' },
      { key: 'paidAcquisitionPct', label: 'Paid Acq %', category: 'Acquisition' },
      { key: 'freeTokens', label: 'Free Tokens', category: 'Free Tier' },
      { key: 'freeTokenConsumptionPct', label: 'Free Usage %', category: 'Free Tier' },
      { key: 'slidesPerDeck', label: 'Slides/Deck', category: 'Usage' },
      { key: 'editsPerDeck', label: 'Edits/Deck', category: 'Usage' },
      { key: 'decksPerActiveUserMonth', label: 'Decks/User', category: 'Usage' },
      { key: 'starterUpgradePct', label: 'Starter→Pro %', category: 'Expansion' },
      { key: 'paidConversionPct', label: 'Direct Paid %', category: 'Conversion' },
    ];
    return params.map(p => {
      const val = inputs[p.key];
      if (typeof val !== 'number' || val === 0) return { ...p, mrrDelta: 0, profitDelta: 0, marginDelta: 0, noEffect: true };
      const up = computeMetrics({ ...inputs, [p.key]: (val as number) * 1.1 });
      const mrrD = base.mrr > 0 ? ((up.mrr - base.mrr) / base.mrr) * 100 : 0;
      const profitD = base.profit !== 0 ? ((up.profit - base.profit) / Math.abs(base.profit)) * 100 : (up.profit !== base.profit ? 100 : 0);
      const marginD = up.margin - base.margin;
      const noEffect = Math.abs(mrrD) < 0.01 && Math.abs(profitD) < 0.01 && Math.abs(marginD) < 0.01;
      return { ...p, mrrDelta: mrrD, profitDelta: profitD, marginDelta: marginD, noEffect };
    }).sort((a, b) => Math.abs(b.profitDelta) - Math.abs(a.profitDelta));
  }, [inputs, computeMetrics]);

  const insights = useMemo(() => {
    const items: { type: 'critical' | 'warning' | 'info' | 'success'; title: string; detail: string }[] = [];
    // Critical
    if (economics.grossMargin < 0) items.push({ type: 'critical', title: 'Negative Gross Margin', detail: `${economics.grossMargin.toFixed(0)}% margin — revenue does not cover costs.` });
    if (economics.netMonthly < 0 && economics.estMRR > 0 && Math.abs(economics.netMonthly) > economics.estMRR * 2) items.push({ type: 'critical', title: 'Unsustainable Burn', detail: `Monthly loss ($${fmtMoney(Math.abs(economics.netMonthly))}) exceeds 2x revenue.` });
    if (inputs.churnPct > inputs.monthlyGrowthPct) items.push({ type: 'critical', title: 'Negative Net Growth', detail: `Churn (${inputs.churnPct}%) > growth (${inputs.monthlyGrowthPct}%). User base is shrinking.` });
    // Warning
    if (economics.grossMargin >= 0 && economics.grossMargin < 50) items.push({ type: 'warning', title: 'Low SaaS Margin', detail: `${economics.grossMargin.toFixed(0)}% is below the 70%+ target.` });
    if (economics.ltvCac > 0 && economics.ltvCac < 3) items.push({ type: 'warning', title: 'LTV:CAC Below 3x', detail: `${economics.ltvCac.toFixed(1)}x ratio. Target is 3x+.` });
    if (economics.paybackMonths > 18 && economics.paybackMonths < 99) items.push({ type: 'warning', title: 'Long Payback', detail: `${economics.paybackMonths.toFixed(0)} months. Target is <12.` });
    if (economics.freeTrialCostMonthly > 0 && economics.estMRR > 0 && economics.freeTrialCostMonthly > economics.estMRR * 0.3) items.push({ type: 'warning', title: 'High Free Tier Cost', detail: `${((economics.freeTrialCostMonthly / economics.estMRR) * 100).toFixed(0)}% of MRR goes to free trials.` });
    // Info
    const topSensitive = sensitivity.filter(s => !s.noEffect && Math.abs(s.profitDelta) > 5);
    if (topSensitive.length > 0) items.push({ type: 'info', title: 'High Sensitivity', detail: `Most sensitive to: ${topSensitive.slice(0, 3).map(s => s.label).join(', ')}. A 10% change significantly impacts profit.` });
    const noEffectParams = sensitivity.filter(s => s.noEffect);
    if (noEffectParams.length > 0) items.push({ type: 'info', title: 'Inactive Parameters', detail: `${noEffectParams.map(s => s.label).join(', ')} don't affect the current model.` });
    if (!inputs.overageEnabled) items.push({ type: 'info', title: 'Overage Disabled', detail: 'Enable overage to see its revenue/cost impact.' });
    // Success
    if (economics.grossMargin >= 70) items.push({ type: 'success', title: 'Healthy Margin', detail: `${economics.grossMargin.toFixed(0)}% exceeds the 70% SaaS benchmark.` });
    if (economics.ltvCac >= 3) items.push({ type: 'success', title: 'Strong Unit Economics', detail: `${economics.ltvCac.toFixed(1)}x LTV:CAC exceeds the 3x target.` });
    if (viralCoeff >= 0.3) items.push({ type: 'success', title: 'PLG Working', detail: `Viral coefficient ${viralCoeff.toFixed(2)} indicates effective product-led growth.` });
    if (economics.netMonthly > 0) items.push({ type: 'success', title: 'Net Profitable', detail: `+$${fmtMoney(economics.netMonthly)}/mo after all costs.` });
    const sortOrder = { critical: 0, warning: 1, info: 2, success: 3 };
    items.sort((a, b) => sortOrder[a.type] - sortOrder[b.type]);
    return items;
  }, [economics, inputs, viralCoeff, sensitivity]);

  // Updaters
  const ui = <K extends keyof EconomicsInputs>(k: K, v: number) => {
    setInputs(prev => ({ ...prev, [k]: v }));
    if (activeScenario !== 'custom') setActiveScenario('custom');
  };
  const updatePlan = (idx: number, field: keyof PlanConfig, value: number | string) => {
    setPlans(prev => {
      const u = [...prev]; u[idx] = { ...u[idx], [field]: value };
      if (field === 'pctOfPaid') {
        const total = u.reduce((s, p) => s + p.pctOfPaid, 0);
        if (total !== 100) {
          const others = u.filter((_, i) => i !== idx);
          const ot = others.reduce((s, p) => s + p.pctOfPaid, 0);
          if (ot > 0) { const rem = 100 - (value as number); others.forEach(p => { const oi = u.findIndex(x => x.name === p.name); u[oi].pctOfPaid = Math.round((p.pctOfPaid / ot) * rem); }); }
        }
      }
      return u;
    });
  };
  const uc = (idx: number, field: keyof GrowthChannel, value: number) => {
    setChannels(prev => { const u = [...prev]; u[idx] = { ...u[idx], [field]: value }; return u; });
    if (activeScenario !== 'custom') setActiveScenario('custom');
  };
  const ub = (idx: number, tier: string, value: number) => setUserBreakdown(prev => { const u = [...prev]; if (u[idx]) u[idx] = { ...u[idx], [tier]: value, isManual: true }; return u; });

  const resetAll = () => {
    setInputs(DEFAULT_INPUTS); setPlans(DEFAULT_PLANS); setEnterprise(DEFAULT_ENTERPRISE);
    setChannels(DEFAULT_CHANNELS); setViral(DEFAULT_VIRAL); setFunnel(DEFAULT_FUNNEL);
    setGeminiFlash(DEFAULT_GEMINI_FLASH); setExpenseRates(DEFAULT_EXPENSE_RATES); setUserBreakdown([]);
    setActiveScenario('aggressive'); setVisitorBaseline(50000);
    Object.values(SK).forEach(k => localStorage.removeItem(k));
  };

  const applyScenario = (id: Exclude<ScenarioId, 'custom'>) => {
    const s = SCENARIOS[id];
    setInputs(prev => ({ ...prev, ...s.inputs }));
    setEnterprise(prev => ({ ...prev, ...s.enterprise }));
    setViral(s.viral);
    setFunnel(s.funnel);
    setVisitorBaseline(s.visitorBaseline);
    setUserBreakdown([]);
    setActiveScenario(id);
    setScenarioJustApplied(true);
    setTimeout(() => setScenarioJustApplied(false), 100);
  };


  const gs = (v: number, good: number, warn: number, higher = true): 'good' | 'warn' | 'bad' => {
    if (higher) return v >= good ? 'good' : v >= warn ? 'warn' : 'bad';
    return v <= good ? 'good' : v <= warn ? 'warn' : 'bad';
  };

  if (isLoading) return <AdminLayoutV2><div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-5 w-5 animate-spin text-[#666]" /></div></AdminLayoutV2>;

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <AdminLayoutV2>
      <div className="space-y-3 max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-bold uppercase tracking-wider" style={hk}>Financial Model</h1>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-[#888]">Live:</span>
              <span className="font-medium tabular-nums">{totalUsers} users</span>
              {realPaidUsers > 0 && <span className="text-emerald-600 font-medium tabular-nums">{realPaidUsers} paid</span>}
              {realMRR > 0 && <span className="text-emerald-600 font-medium tabular-nums">${realMRR.toFixed(0)} MRR</span>}
              <span className="text-[#333] dark:text-[#555]">|</span>
              <span className="text-[#FF4301] font-medium tabular-nums">${fmtMoney(economics.estMRR)} MRR</span>
              <span className={cn("font-medium tabular-nums", economics.netMonthly >= 0 ? "text-emerald-600" : "text-red-500")}>
                {economics.netMonthly >= 0 ? '+' : ''}{fmtMoney(economics.netMonthly)} net
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={resetAll} className="text-[9px] text-[#888] hover:text-[#666] px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors">Reset</button>
            <button onClick={() => refetch()} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"><RefreshCw className="h-3.5 w-3.5 text-[#888]" /></button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0.5 border-b border-[#eaeaea] dark:border-[#333]">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium border-b-2 transition-colors -mb-px",
              activeTab === tab.id ? "border-[#FF4301] text-[#FF4301]" : "border-transparent text-[#666] dark:text-[#888] hover:text-black dark:hover:text-white"
            )}>{tab.icon}{tab.label}</button>
          ))}
        </div>

        {/* Insights Banner */}
        {insights.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {insights.slice(0, 5).map((item, i) => (
              <div key={i} className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] border transition-colors",
                item.type === 'critical' && "bg-red-500/[0.08] text-red-700 dark:text-red-400 border-red-500/20",
                item.type === 'warning' && "bg-amber-500/[0.08] text-amber-700 dark:text-amber-400 border-amber-500/20",
                item.type === 'info' && "bg-blue-500/[0.08] text-blue-700 dark:text-blue-400 border-blue-500/20",
                item.type === 'success' && "bg-emerald-500/[0.08] text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
              )}>
                <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0",
                  item.type === 'critical' && "bg-red-500",
                  item.type === 'warning' && "bg-amber-500",
                  item.type === 'info' && "bg-blue-500",
                  item.type === 'success' && "bg-emerald-500",
                )} />
                <span className="font-medium whitespace-nowrap">{item.title}</span>
                <span className="text-[9px] opacity-70 hidden lg:inline">{item.detail}</span>
              </div>
            ))}
          </div>
        )}

        {/* ═══ PERSISTENT CHART PANEL ═══ */}
        {!chartOpen && (
          <button onClick={() => setChartOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FF4301]/5 hover:bg-[#FF4301]/10 border border-[#FF4301]/20 rounded-lg text-[10px] text-[#FF4301] font-medium transition-colors">
            <ChevronDown className="h-3 w-3" /> Show Chart
          </button>
        )}
        <div className={cn(cd, "overflow-hidden transition-all duration-300 ease-in-out", chartOpen ? "opacity-100" : "h-0 p-0 border-0 opacity-0")}>
          <div className="flex items-center justify-between p-2.5 pb-0">
            <div className="flex items-center gap-3">
              <span className={sH} style={hk}>Financial Projection</span>
              {/* Scenario selector */}
              <select
                value={activeScenario}
                onChange={e => {
                  const val = e.target.value as ScenarioId;
                  if (val !== 'custom') applyScenario(val);
                }}
                className="h-5 text-[9px] bg-[#f5f5f5] dark:bg-[#1a1a1a] border border-[#eaeaea] dark:border-[#333] rounded-md px-1.5 text-[#666] dark:text-[#aaa] cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#FF4301]/30"
              >
                <option value="conservative">Conservative</option>
                <option value="aggressive">Aggressive Launch</option>
                <option value="viral">Viral Breakout</option>
                {activeScenario === 'custom' && <option value="custom">Custom</option>}
              </select>
            </div>
            <div className="flex items-center gap-2">
              {/* Month range control */}
              <div className="flex items-center bg-[#f5f5f5] dark:bg-[#1a1a1a] rounded-lg p-0.5">
                {[1, 6, 12].map(n => (
                  <button key={n} onClick={() => { setProjectionMonths(n); setSelectedMonth(Math.min(selectedMonth, n)); }} className={cn(
                    "px-2.5 py-0.5 text-[9px] font-medium rounded-md transition-colors",
                    projectionMonths === n ? "bg-white dark:bg-[#222] text-[#FF4301] shadow-sm" : "text-[#888] hover:text-[#666]"
                  )}>{n}mo</button>
                ))}
              </div>
              {/* Size toggle */}
              <div className="flex items-center bg-[#f5f5f5] dark:bg-[#1a1a1a] rounded-lg p-0.5">
                {(['S', 'M', 'L'] as const).map(s => (
                  <button key={s} onClick={() => setChartSize(s)} className={cn(
                    "px-2 py-0.5 text-[9px] font-medium rounded-md transition-colors",
                    chartSize === s ? "bg-white dark:bg-[#222] text-[#FF4301] shadow-sm" : "text-[#888] hover:text-[#666]"
                  )}>{s}</button>
                ))}
              </div>
              {/* Collapse button */}
              <button onClick={() => setChartOpen(false)} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors" title="Collapse chart">
                <ChevronUp className="h-3 w-3 text-[#888]" />
              </button>
            </div>
          </div>
          <div style={{ height: chartHeight }} className="transition-all duration-300">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={projectionData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }} onClick={(e: any) => e?.activeTooltipIndex !== undefined && setSelectedMonth(e.activeTooltipIndex)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.08} />
                <XAxis dataKey="month" tick={{ fontSize: 9 }} tickLine={false} />
                <YAxis yAxisId="users" orientation="left" tick={{ fontSize: 9 }} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                <YAxis yAxisId="money" orientation="right" tick={{ fontSize: 9 }} tickLine={false} tickFormatter={(v: number) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                <Tooltip content={<CTip />} />
                <Legend wrapperStyle={{ fontSize: '9px' }} />
                <ReferenceLine y={0} yAxisId="money" stroke="#666" strokeDasharray="3 3" />
                <ReferenceLine x={MONTH_LABELS[selectedMonth]} yAxisId="users" stroke="#FF4301" strokeWidth={2} strokeDasharray="4 4" />
                <Line yAxisId="users" type="monotone" dataKey="users" name="Users" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 2 }} />
                <Line yAxisId="users" type="monotone" dataKey="paidUsers" name="Paid" stroke="#f59e0b" strokeWidth={1.5} dot={{ r: 1.5 }} strokeDasharray="3 2" />
                <Area yAxisId="money" type="monotone" dataKey="cumRevenue" name="Cum. Revenue" fill="#10b981" fillOpacity={0.12} stroke="#10b981" strokeWidth={2} />
                <Area yAxisId="money" type="monotone" dataKey="cumCosts" name="Cum. Costs" fill="#ef4444" fillOpacity={0.08} stroke="#ef4444" strokeWidth={2} />
                <Line yAxisId="money" type="monotone" dataKey="cumProfit" name="Cum. Profit" stroke="#3b82f6" strokeWidth={2.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {/* KPI strip */}
          <div className="grid grid-cols-5 gap-2 px-3 pb-2.5 pt-1">
            {[
              { label: 'MRR', value: `$${fmtMoney(economics.estMRR)}`, color: economics.estMRR > 0 ? 'text-emerald-600' : 'text-[#888]' },
              { label: 'Gross Margin', value: `${economics.grossMargin.toFixed(0)}%`, color: economics.grossMargin >= 70 ? 'text-emerald-600' : economics.grossMargin >= 50 ? 'text-amber-500' : 'text-red-500' },
              { label: 'LTV:CAC', value: `${economics.ltvCac.toFixed(1)}x`, color: economics.ltvCac >= 3 ? 'text-emerald-600' : economics.ltvCac >= 1 ? 'text-amber-500' : 'text-red-500' },
              { label: 'Burn Rate', value: economics.netMonthly >= 0 ? '$0' : `$${fmtMoney(Math.abs(economics.netMonthly))}`, color: economics.netMonthly >= 0 ? 'text-emerald-600' : 'text-red-500' },
              { label: 'Breakeven', value: economics.breakEvenPaidUsers > 0 ? `${economics.breakEvenPaidUsers} users` : 'N/A', color: economics.estPaidUsers >= economics.breakEvenPaidUsers ? 'text-emerald-600' : 'text-amber-500' },
            ].map((kpi, i) => (
              <div key={i} className="flex items-center justify-between px-2 py-1 bg-[#fafafa] dark:bg-[#0a0a0a] rounded-md">
                <span className="text-[8px] text-[#888]">{kpi.label}</span>
                <span className={cn("text-[10px] font-semibold tabular-nums", kpi.color)}>{kpi.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ═══ OVERVIEW ═══ */}
        {activeTab === 'overview' && (
          <div className="space-y-3">
            <div className="grid grid-cols-4 lg:grid-cols-8 gap-2">
              <KPI label="MRR" value={`$${fmtMoney(economics.estMRR)}`} sub={`${economics.estPaidUsers} paying`} status={gs(economics.estMRR, 1000, 100)} />
              <KPI label="ARR" value={`$${fmtMoney(annualMetrics.arr)}`} sub="projected" status={gs(annualMetrics.arr, 10000, 1000)} />
              <KPI label="Gross Margin" value={`${economics.grossMargin.toFixed(0)}%`} sub={economics.grossMargin >= 70 ? 'healthy' : 'below target'} status={gs(economics.grossMargin, 70, 50)} />
              <KPI label="LTV:CAC" value={`${economics.ltvCac.toFixed(1)}x`} sub={`LTV $${economics.ltv.toFixed(0)}`} status={gs(economics.ltvCac, 3, 1)} />
              <KPI label="Burn Rate" value={`$${fmtMoney(Math.max(0, -economics.netMonthly))}/mo`} sub={economics.netMonthly >= 0 ? 'profitable' : 'burning'} status={economics.netMonthly >= 0 ? 'good' : 'bad'} />
              <KPI label="Breakeven" value={economics.breakEvenPaidUsers > 0 ? `${economics.breakEvenPaidUsers} users` : 'N/A'} sub={economics.estPaidUsers >= economics.breakEvenPaidUsers ? 'reached' : 'not yet'} status={economics.estPaidUsers >= economics.breakEvenPaidUsers ? 'good' : 'warn'} />
              <KPI label="Blended CAC" value={`$${blendedCAC.toFixed(2)}`} sub={`${weightedConv.toFixed(1)}% conv`} status={gs(blendedCAC, 5, 15, false)} />
              <KPI label="Rev/User" value={`$${economics.blendedARPU.toFixed(2)}`} sub="monthly" status={gs(economics.blendedARPU, 15, 8)} />
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {[
                { l: `M${selectedMonth} Users`, v: fmtNum(selectedData?.users || 0), s: `${fmtNum(selectedData?.paidUsers || 0)} paid`, b: 'border-purple-500/30', c: 'text-[#FF4301]' },
                { l: 'Monthly Rev', v: `$${fmtMoney(selectedData?.revenue || 0)}`, s: `subs $${fmtMoney(selectedData?.subscriptionRevenue || 0)}`, b: 'border-emerald-500/30', c: 'text-emerald-600' },
                { l: 'Monthly Costs', v: `$${fmtMoney(selectedData?.costs || 0)}`, s: `API $${fmtMoney(selectedData?.apiCosts || 0)}`, b: 'border-red-500/30', c: 'text-red-600' },
                { l: 'Monthly Profit', v: `$${fmtMoney(selectedData?.profit || 0)}`, s: `margin ${selectedData?.revenue ? ((selectedData.profit / selectedData.revenue) * 100).toFixed(0) : 0}%`, b: (selectedData?.profit || 0) >= 0 ? 'border-blue-500/30' : 'border-red-500/30', c: (selectedData?.profit || 0) >= 0 ? 'text-blue-600' : 'text-red-600' },
                { l: 'Cum. Revenue', v: `$${fmtMoney(selectedData?.cumRevenue || 0)}`, s: `after ${selectedMonth}mo`, b: 'border-emerald-500/20', c: 'text-emerald-600' },
                { l: 'Cum. Profit', v: `$${fmtMoney(selectedData?.cumProfit || 0)}`, s: `${selectedData?.cumRevenue ? ((selectedData.cumProfit / selectedData.cumRevenue) * 100).toFixed(0) : 0}% margin`, b: (selectedData?.cumProfit || 0) >= 0 ? 'border-blue-500/20' : 'border-red-500/20', c: (selectedData?.cumProfit || 0) >= 0 ? 'text-blue-600' : 'text-red-600' },
              ].map((m, i) => (
                <div key={i} className={cn("bg-white dark:bg-[#111] border rounded-lg p-2 text-center", m.b)}>
                  <div className={cn("text-[9px] font-medium", m.c)}>{m.l}</div>
                  <div className={cn("text-sm font-semibold tabular-nums", m.c)}>{m.v}</div>
                  <div className="text-[8px] text-[#888]">{m.s}</div>
                </div>
              ))}
            </div>
            <div className={cn(cd, "p-3")}>
              <span className={sH} style={hk}>Health Scorecard</span>
              <div className="grid grid-cols-2 lg:grid-cols-6 gap-2 mt-2">
                <MR label="Cost/Deck" value={`$${economics.costPerDeck.toFixed(3)}`} status={gs(economics.costPerDeck, 0.2, 0.5, false)} />
                <MR label="Cost/Paid User" value={`$${economics.costPerPaidUser.toFixed(2)}`} status={gs(economics.costPerPaidUser, 5, 10, false)} />
                <MR label="Payback Period" value={economics.paybackMonths < 99 ? `${economics.paybackMonths.toFixed(1)} mo` : 'N/A'} status={gs(economics.paybackMonths, 6, 18, false)} />
                <MR label="Free Trial Cost" value={`$${fmtMoney(economics.freeTrialCostMonthly)}/mo`} status={gs(economics.freeTrialCostMonthly, 50, 200, false)} />
                <MR label="Landing CAC" value={`$${geminiMetrics.costPerSignup.toFixed(3)}`} status={gs(geminiMetrics.costPerSignup, 0.5, 2, false)} />
                <MR label="Viral Coefficient" value={viralCoeff.toFixed(2)} status={gs(viralCoeff, 0.3, 0.1)} />
              </div>
            </div>
            {/* Sensitivity Analysis */}
            <div className={cn(cd, "p-3")}>
              <div className="flex items-center justify-between mb-2">
                <span className={sH} style={hk}>Sensitivity Analysis</span>
                <span className="text-[9px] text-[#888]">Impact of +10% change per parameter</span>
              </div>
              <div className="grid grid-cols-[120px_56px_56px_56px_56px_1fr] gap-1 text-[8px] text-[#888] font-medium pb-1 border-b border-[#eaeaea] dark:border-[#333]">
                <span>Parameter</span><span className="text-center">Category</span><span className="text-right">Profit</span><span className="text-right">MRR</span><span className="text-right">Margin</span><span className="pl-2">Impact</span>
              </div>
              {sensitivity.map(s => {
                const absProfit = Math.abs(s.profitDelta);
                const impactLevel = s.noEffect ? 'none' : absProfit > 10 ? 'high' : absProfit > 2 ? 'medium' : 'low';
                return (
                  <div key={s.key} className={cn(
                    "grid grid-cols-[120px_56px_56px_56px_56px_1fr] gap-1 py-1.5 border-b border-[#eaeaea]/50 dark:border-[#333]/50 items-center text-[9px]",
                    s.noEffect && "opacity-35"
                  )}>
                    <span className="font-medium truncate">{s.label}</span>
                    <span className="text-center text-[8px] text-[#888]">{s.category}</span>
                    <span className={cn("text-right tabular-nums font-medium", s.profitDelta > 0.01 ? "text-emerald-600" : s.profitDelta < -0.01 ? "text-red-600" : "text-[#888]")}>
                      {s.noEffect ? '-' : `${s.profitDelta > 0 ? '+' : ''}${s.profitDelta.toFixed(1)}%`}
                    </span>
                    <span className={cn("text-right tabular-nums", s.mrrDelta > 0.01 ? "text-emerald-600" : s.mrrDelta < -0.01 ? "text-red-600" : "text-[#888]")}>
                      {s.noEffect ? '-' : `${s.mrrDelta > 0 ? '+' : ''}${s.mrrDelta.toFixed(1)}%`}
                    </span>
                    <span className={cn("text-right tabular-nums", s.marginDelta > 0.01 ? "text-emerald-600" : s.marginDelta < -0.01 ? "text-red-600" : "text-[#888]")}>
                      {s.noEffect ? '-' : `${s.marginDelta > 0 ? '+' : ''}${s.marginDelta.toFixed(1)}pp`}
                    </span>
                    <div className="flex items-center gap-1.5 pl-2">
                      <div className="flex-1 h-2 bg-[#f5f5f5] dark:bg-[#1a1a1a] rounded overflow-hidden">
                        <div className={cn("h-full rounded transition-all duration-300",
                          impactLevel === 'high' ? "bg-red-500" : impactLevel === 'medium' ? "bg-amber-500" : impactLevel === 'low' ? "bg-emerald-500/60" : "bg-[#ddd] dark:bg-[#444]"
                        )} style={{ width: `${Math.min(100, absProfit * 5)}%` }} />
                      </div>
                      {s.noEffect && <span className="text-[7px] text-[#aaa] whitespace-nowrap">no effect</span>}
                      {impactLevel === 'high' && <span className="text-[7px] text-red-500 font-bold whitespace-nowrap">HIGH</span>}
                    </div>
                  </div>
                );
              })}
              <div className="mt-2 pt-2 border-t border-[#eaeaea] dark:border-[#333] text-[8px] text-[#888] space-y-0.5">
                <div className="flex items-center gap-2"><span className="w-2 h-1.5 rounded bg-red-500" />HIGH: &gt;10% profit impact per 10% change</div>
                <div className="flex items-center gap-2"><span className="w-2 h-1.5 rounded bg-amber-500" />MEDIUM: 2-10% impact</div>
                <div className="flex items-center gap-2"><span className="w-2 h-1.5 rounded bg-emerald-500/60" />LOW: &lt;2% impact</div>
                <div className="text-[#aaa] mt-1">Parameters marked "no effect" are gated by other settings (e.g., overage disabled) or don't affect current-month economics.</div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ REVENUE ═══ */}
        {activeTab === 'revenue' && (
          <div className="space-y-3">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-5">
                <div className={cn(cd, "p-3")}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={sH} style={hk}>Pricing Plans</span>
                    <span className="text-[10px] text-emerald-600 font-medium tabular-nums">ARPU ${blendedARPU.toFixed(2)}</span>
                  </div>
                  <div className="space-y-2">
                    {plans.map((plan, i) => {
                      const dpm = tokensPerDeck > 0 ? Math.floor(plan.tokens / tokensPerDeck) : 0;
                      return (
                        <div key={plan.name} className="border border-[#eaeaea] dark:border-[#333] rounded-lg p-2">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <Input value={plan.name} onChange={e => updatePlan(i, 'name', e.target.value)} className="h-5 w-20 text-[10px] px-1 font-medium" />
                            <span className="text-[9px] text-[#888]">$</span>
                            <Input type="number" value={plan.price} onChange={e => updatePlan(i, 'price', Number(e.target.value))} className="h-5 w-16 text-[10px] px-1 text-right" />
                            <Input type="number" value={plan.tokens} onChange={e => updatePlan(i, 'tokens', Number(e.target.value))} className="h-5 w-20 text-[10px] px-1 text-right" />
                            <span className="text-[9px] text-[#888]">tok</span>
                            <Input type="number" value={plan.pctOfPaid} onChange={e => updatePlan(i, 'pctOfPaid', Number(e.target.value))} className="h-5 w-14 text-[10px] px-1 text-center" />
                            <span className="text-[9px] text-[#888]">%</span>
                          </div>
                          <div className="flex items-center justify-between text-[8px] text-[#888]">
                            <span>{dpm} decks/mo</span><span>${dpm > 0 ? (plan.price / dpm).toFixed(2) : '0'}/deck</span><span>{inputs.slidesPerDeck} slides</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 pt-2 border-t border-[#eaeaea] dark:border-[#333] flex items-center gap-2 text-[9px]">
                    <span className="text-orange-600 font-medium">Enterprise</span>
                    <Input type="number" value={enterprise.dealsPerYear} onChange={e => setEnterprise(p => ({ ...p, dealsPerYear: Number(e.target.value) }))} className="h-5 w-14 text-[9px] text-center" />
                    <span className="text-[#888]">deals/yr × $</span>
                    <Input type="number" value={enterprise.avgDealSize} onChange={e => setEnterprise(p => ({ ...p, avgDealSize: Number(e.target.value) }))} className="h-5 w-20 text-[9px] text-center" />
                    <span className="text-orange-600 font-medium">= ${fmtMoney(enterprise.dealsPerYear * enterprise.avgDealSize)}/yr</span>
                  </div>
                </div>
              </div>
              <div className="col-span-7 space-y-3">
                <div className={cn(cd, "p-3")}>
                  <span className={sH} style={hk}>Revenue Streams (Monthly)</span>
                  <div className="space-y-2 mt-2">
                    {[
                      { name: 'Subscriptions', value: economics.subscriptionRevenue, color: '#10b981' },
                      { name: 'Enterprise', value: economics.enterpriseRevenue, color: '#f97316' },
                      { name: 'Overage', value: economics.overageRevenue, color: '#8b5cf6' },
                      { name: 'Upgrades', value: economics.upgradeRevenue, color: '#3b82f6' },
                    ].map(st => {
                      const pct = economics.estMRR > 0 ? (st.value / economics.estMRR) * 100 : 0;
                      return (
                        <div key={st.name} className="flex items-center gap-2">
                          <span className="text-[9px] text-[#888] w-20">{st.name}</span>
                          <div className="flex-1 h-4 bg-[#f5f5f5] dark:bg-[#1a1a1a] rounded overflow-hidden">
                            <div className="h-full rounded transition-all duration-500" style={{ width: `${Math.max(1, pct)}%`, backgroundColor: st.color }} />
                          </div>
                          <span className="text-[9px] font-medium tabular-nums w-16 text-right">${fmtMoney(st.value)}</span>
                          <span className="text-[8px] text-[#888] w-10 text-right">{pct.toFixed(0)}%</span>
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between pt-1.5 border-t border-[#eaeaea] dark:border-[#333] text-[10px] font-medium">
                      <span>Total MRR</span><span className="text-emerald-600 tabular-nums">${fmtMoney(economics.estMRR)}</span>
                    </div>
                  </div>
                </div>
                <div className={cn(cd, "p-3")}>
                  <span className={sH} style={hk}>Conversion & Growth</span>
                  <div className="grid grid-cols-3 gap-3 mt-2">
                    <div className="space-y-1.5">
                      <CI label="Direct Paid %" value={inputs.paidConversionPct} onChange={v => ui('paidConversionPct', v)} step={0.5} />
                      <CI label="Free→Paid %" value={inputs.freeToPayConvPct} onChange={v => ui('freeToPayConvPct', v)} />
                      <div className="text-[8px] text-[#FF4301] font-medium pl-1">→ {effectiveConvPct.toFixed(1)}% effective</div>
                    </div>
                    <div className="space-y-1.5">
                      <CI label="Growth %/mo" value={inputs.monthlyGrowthPct} onChange={v => ui('monthlyGrowthPct', v)} />
                      <CI label="Churn %/mo" value={inputs.churnPct} onChange={v => ui('churnPct', v)} />
                      <div className="text-[8px] text-[#888] pl-1">Net: +{(inputs.monthlyGrowthPct - inputs.churnPct).toFixed(0)}%/mo</div>
                    </div>
                    <div className="space-y-1.5">
                      <CI label="Starter→Pro %" value={inputs.starterUpgradePct} onChange={v => ui('starterUpgradePct', v)} />
                      <CI label="Decks/User/mo" value={inputs.decksPerActiveUserMonth} onChange={v => ui('decksPerActiveUserMonth', v)} />
                      <CI label="Free Tokens" value={inputs.freeTokens} onChange={v => ui('freeTokens', v)} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ COSTS ═══ */}
        {activeTab === 'costs' && (
          <div className="space-y-3">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-5 space-y-3">
                <div className={cn(cd, "p-3")}>
                  <span className={sH} style={hk}>AI Model Pricing</span>
                  <div className="mt-2">
                    <div className="grid grid-cols-4 gap-1 text-[8px] text-[#888] font-medium pb-1 border-b border-[#eaeaea] dark:border-[#333]">
                      <span>Model</span><span className="text-right">In/1M</span><span className="text-right">Out/1M</span><span className="text-right">Eff.</span>
                    </div>
                    {Object.entries(MODEL_COSTS).map(([key, m]) => (
                      <div key={key} className="grid grid-cols-4 gap-1 py-1.5 border-b border-[#eaeaea]/50 dark:border-[#333]/50 text-[9px]">
                        <span className="font-medium truncate">{m.name}</span>
                        <span className="text-right text-[#888] tabular-nums">${m.input.toFixed(2)}</span>
                        <span className="text-right text-[#888] tabular-nums">${m.output.toFixed(2)}</span>
                        <span className="text-right font-medium tabular-nums">${(m.input * 0.2 + m.output * 0.8).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className={cn(cd, "p-3")}>
                  <span className={sH} style={hk}>Operation Costs</span>
                  <div className="mt-2">
                    <div className="grid grid-cols-5 gap-1 text-[8px] text-[#888] font-medium pb-1 border-b border-[#eaeaea] dark:border-[#333]">
                      <span>Op</span><span className="text-right">In</span><span className="text-right">Out</span><span className="text-right">Model</span><span className="text-right">Cost</span>
                    </div>
                    {Object.entries(OP_TOKENS).map(([key, op]) => (
                      <div key={key} className="grid grid-cols-5 gap-1 py-1.5 border-b border-[#eaeaea]/50 dark:border-[#333]/50 text-[9px]">
                        <span className="font-medium">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                        <span className="text-right text-[#888] tabular-nums">{op.input}</span>
                        <span className="text-right text-[#888] tabular-nums">{op.output}</span>
                        <span className="text-right text-[#888]">{op.model}</span>
                        <span className="text-right font-medium text-red-600 tabular-nums">${calcOpCost(key as any).toFixed(4)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="col-span-7 space-y-3">
                <div className={cn(cd, "p-3")}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={sH} style={hk}>Cost Per Deck</span>
                    <span className="text-sm font-semibold text-red-600 tabular-nums">${costPerDeck.toFixed(4)}</span>
                  </div>
                  <div className="space-y-1.5">
                    {costBreakdown.map(item => (
                      <div key={item.name} className="flex items-center gap-2">
                        <span className="text-[9px] text-[#888] w-14">{item.name}</span>
                        <div className="flex-1 h-3 bg-[#f5f5f5] dark:bg-[#1a1a1a] rounded overflow-hidden">
                          <div className="h-full rounded" style={{ width: `${item.pct}%`, backgroundColor: item.color }} />
                        </div>
                        <span className="text-[9px] tabular-nums w-14 text-right">${item.cost.toFixed(4)}</span>
                        <span className="text-[8px] text-[#888] w-8 text-right">{item.pct.toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-2 border-t border-[#eaeaea] dark:border-[#333] grid grid-cols-2 gap-2">
                    <CI label="$/Slide" value={inputs.apiCostPerSlide} onChange={v => ui('apiCostPerSlide', v)} step={0.001} />
                    <CI label="$/Edit" value={inputs.apiCostPerEdit} onChange={v => ui('apiCostPerEdit', v)} step={0.001} />
                    <CI label="$/Research" value={inputs.apiCostPerResearch} onChange={v => ui('apiCostPerResearch', v)} step={0.001} />
                    <CI label="$/Theme" value={inputs.apiCostPerTheme} onChange={v => ui('apiCostPerTheme', v)} step={0.001} />
                  </div>
                </div>
                <div className={cn(cd, "p-3 border-blue-500/20")}>
                  <div className="flex items-center gap-2 mb-2"><Zap className="h-3.5 w-3.5 text-blue-500" /><span className="text-[10px] font-bold uppercase tracking-wider text-blue-500" style={hk}>Gemini Flash Free Tier</span></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <CI label="Cost/Free Deck" value={geminiFlash.costPerDeck} onChange={v => setGeminiFlash(p => ({ ...p, costPerDeck: v }))} step={0.01} />
                      <CI label="Typing Rate %" value={geminiFlash.typingRate} onChange={v => setGeminiFlash(p => ({ ...p, typingRate: v }))} />
                      <CI label="Completion %" value={geminiFlash.completionRate} onChange={v => setGeminiFlash(p => ({ ...p, completionRate: v }))} />
                      <CI label="Signup Rate %" value={geminiFlash.signupRate} onChange={v => setGeminiFlash(p => ({ ...p, signupRate: v }))} />
                    </div>
                    <div className="space-y-1 text-[9px]">
                      <div className="flex justify-between"><span className="text-[#888]">Visitors type</span><span className="tabular-nums">{geminiMetrics.typed}</span></div>
                      <div className="flex justify-between"><span className="text-[#888]">Decks gen'd</span><span className="tabular-nums">{geminiMetrics.generated}</span></div>
                      <div className="flex justify-between"><span className="text-[#888]">Signups</span><span className="tabular-nums font-medium text-blue-600">{geminiMetrics.signedUp}</span></div>
                      <div className="flex justify-between"><span className="text-[#888]">Monthly cost</span><span className="tabular-nums text-red-600">${fmtMoney(geminiMetrics.totalCost)}</span></div>
                      <div className="flex justify-between pt-1 border-t border-[#eaeaea] dark:border-[#333]"><span className="text-[#888] font-medium">CAC via landing</span><span className="tabular-nums font-medium text-blue-600">${geminiMetrics.costPerSignup.toFixed(3)}</span></div>
                    </div>
                  </div>
                </div>
                <div className={cn(cd, "p-3")}>
                  <span className={sH} style={hk}>Operating Expenses (Monthly)</span>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <CI label="Headcount" value={expenseRates.headcount} onChange={v => setExpenseRates(p => ({ ...p, headcount: v }))} />
                    <CI label="Salary/mo" value={expenseRates.avgSalary} onChange={v => setExpenseRates(p => ({ ...p, avgSalary: v }))} />
                    <CI label="Render" value={expenseRates.render} onChange={v => setExpenseRates(p => ({ ...p, render: v }))} />
                    <CI label="Supabase" value={expenseRates.supabase} onChange={v => setExpenseRates(p => ({ ...p, supabase: v }))} />
                    <CI label="SerpAPI" value={expenseRates.serpapi} onChange={v => setExpenseRates(p => ({ ...p, serpapi: v }))} />
                    <CI label="Stripe %" value={expenseRates.stripePct} onChange={v => setExpenseRates(p => ({ ...p, stripePct: v }))} step={0.1} />
                    <CI label="Other" value={expenseRates.other} onChange={v => setExpenseRates(p => ({ ...p, other: v }))} />
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-[#888] font-medium">Total OpEx</span>
                      <span className="font-semibold text-red-600 tabular-nums">${fmtMoney(expenseRates.headcount * expenseRates.avgSalary + expenseRates.render + expenseRates.supabase + expenseRates.serpapi + expenseRates.other + (economics.estMRR * expenseRates.stripePct / 100))}/mo</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ GROWTH & PLG ═══ */}
        {activeTab === 'growth' && (
          <div className="space-y-3">
            <div className={cn(cd, "p-3")}>
              <div className="flex items-center justify-between mb-2">
                <span className={sH} style={hk}>Growth Channel Attribution</span>
                <div className="flex items-center gap-3 text-[9px]">
                  <span className="text-[#888]">Blended CAC: <span className="font-medium text-[#FF4301]">${blendedCAC.toFixed(2)}</span></span>
                  <span className="text-[#888]">Weighted Conv: <span className="font-medium text-emerald-600">{weightedConv.toFixed(1)}%</span></span>
                </div>
              </div>
              <div className="grid grid-cols-[24px_130px_70px_55px_55px_70px_70px_1fr] gap-1 text-[8px] text-[#888] font-medium pb-1 border-b border-[#eaeaea] dark:border-[#333]">
                <span></span><span>Channel</span><span className="text-right">% Sign</span><span className="text-right">CAC</span><span className="text-right">Conv%</span><span className="text-right">Sign/mo</span><span className="text-right">Paid/mo</span><span className="text-right">Cost/mo</span>
              </div>
              {channelMetrics.map((ch, i) => (
                <div key={ch.id} className="grid grid-cols-[24px_130px_70px_55px_55px_70px_70px_1fr] gap-1 py-1 border-b border-[#eaeaea]/50 dark:border-[#333]/50 items-center text-[9px]">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ch.color }} />
                  <span className="font-medium flex items-center gap-1">{ch.icon}{ch.name}</span>
                  <Input type="number" value={ch.pctOfSignups} onChange={e => uc(i, 'pctOfSignups', Number(e.target.value))} className="h-5 text-[9px] text-right px-1" />
                  <div className="flex items-center justify-end"><span className="text-[8px] text-[#888]">$</span><Input type="number" value={ch.cac} onChange={e => uc(i, 'cac', Number(e.target.value))} className="h-5 w-14 text-[9px] text-right px-0.5" step={0.5} /></div>
                  <Input type="number" value={ch.convToPaid} onChange={e => uc(i, 'convToPaid', Number(e.target.value))} className="h-5 text-[9px] text-right px-1" />
                  <span className="text-right tabular-nums text-[#888]">{ch.signups}</span>
                  <span className="text-right tabular-nums font-medium text-emerald-600">{ch.paidUsers}</span>
                  <span className="text-right tabular-nums text-red-600">{ch.monthlyCost > 0 ? `$${fmtMoney(ch.monthlyCost)}` : '$0'}</span>
                </div>
              ))}
              <div className="grid grid-cols-[24px_130px_70px_55px_55px_70px_70px_1fr] gap-1 pt-1 text-[9px] font-medium">
                <span></span><span>Total</span>
                <span className="text-right">{channels.reduce((s, c) => s + c.pctOfSignups, 0)}%</span>
                <span className="text-right text-[#FF4301]">${blendedCAC.toFixed(2)}</span>
                <span className="text-right text-emerald-600">{weightedConv.toFixed(1)}%</span>
                <span className="text-right tabular-nums">{channelMetrics.reduce((s, c) => s + c.signups, 0)}</span>
                <span className="text-right tabular-nums text-emerald-600">{channelMetrics.reduce((s, c) => s + c.paidUsers, 0)}</span>
                <span className="text-right tabular-nums text-red-600">${fmtMoney(channelMetrics.reduce((s, c) => s + c.monthlyCost, 0))}</span>
              </div>
            </div>
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-4">
                <div className={cn(cd, "p-3")}>
                  <span className={sH} style={hk}>Viral Coefficient</span>
                  <div className="mt-3 mb-3 text-center">
                    <div className={cn("text-4xl font-bold tabular-nums", viralCoeff >= 0.3 ? "text-emerald-600" : viralCoeff >= 0.15 ? "text-amber-500" : "text-red-500")}>{viralCoeff.toFixed(2)}</div>
                    <div className="text-[9px] text-[#888] mt-1">k-factor {viralCoeff >= 1 ? '(viral!)' : viralCoeff >= 0.3 ? '(good PLG)' : '(needs work)'}</div>
                  </div>
                  <div className="space-y-1.5">
                    <CI label="Shares/user/mo" value={viral.sharesPerUserMonth} onChange={v => setViral(p => ({ ...p, sharesPerUserMonth: v }))} />
                    <CI label="Views/share" value={viral.viewsPerShare} onChange={v => setViral(p => ({ ...p, viewsPerShare: v }))} />
                    <CI label="CTR %" value={viral.clickThroughRate} onChange={v => setViral(p => ({ ...p, clickThroughRate: v }))} step={0.5} />
                    <CI label="Signup rate %" value={viral.signupRate} onChange={v => setViral(p => ({ ...p, signupRate: v }))} />
                    <CI label="Referral boost %" value={viral.referralBoost} onChange={v => setViral(p => ({ ...p, referralBoost: v }))} />
                  </div>
                  <div className="mt-2 pt-2 border-t border-[#eaeaea] dark:border-[#333] text-[8px] text-[#888]">
                    <div>Base: {viral.sharesPerUserMonth}×{viral.viewsPerShare}×{viral.clickThroughRate}%×{viral.signupRate}% = {(viral.sharesPerUserMonth * viral.viewsPerShare * (viral.clickThroughRate / 100) * (viral.signupRate / 100)).toFixed(3)}</div>
                    <div>+ Referral: +{(viral.referralBoost / 100).toFixed(2)}</div>
                  </div>
                </div>
              </div>
              <div className="col-span-4">
                <div className={cn(cd, "p-3")}>
                  <span className={sH} style={hk}>Conversion Funnel</span>
                  <div className="mt-3 space-y-1">
                    {funnelData.map((stage, i) => {
                      const w = Math.max(8, stage.pct);
                      const colors = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#FF4301'];
                      return (
                        <div key={stage.name}>
                          <div className="flex items-center justify-between text-[8px] mb-0.5">
                            <span className="text-[#888]">{stage.name}</span>
                            <span className="tabular-nums font-medium">{fmtNum(stage.count)} <span className="text-[#888]">({stage.pct.toFixed(1)}%)</span></span>
                          </div>
                          <div className="h-5 bg-[#f5f5f5] dark:bg-[#1a1a1a] rounded overflow-hidden mx-auto" style={{ width: `${w}%` }}>
                            <div className="w-full h-full rounded" style={{ backgroundColor: colors[i] || '#666', opacity: 0.7 }} />
                          </div>
                          {i < funnelData.length - 1 && (
                            <div className="flex items-center justify-center my-0.5">
                              <ChevronRight className="h-2.5 w-2.5 text-[#ccc] dark:text-[#555] rotate-90" />
                              <span className="text-[7px] text-[#888] ml-0.5">{funnel[i + 1]?.rate}%</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <div className="pt-2 border-t border-[#eaeaea] dark:border-[#333] text-[9px] flex justify-between">
                      <span className="text-[#888]">Visitor → Paid</span>
                      <span className="font-medium text-[#FF4301] tabular-nums">{funnelData.length > 0 ? ((funnelData[funnelData.length - 1].count / funnelData[0].count) * 100).toFixed(2) : 0}%</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="col-span-4">
                <div className={cn(cd, "p-3")}>
                  <span className={sH} style={hk}>Channel Mix</span>
                  <div className="h-[200px] mt-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={channelMetrics.filter(c => c.signups > 0)} dataKey="signups" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={75} paddingAngle={2}>
                          {channelMetrics.filter(c => c.signups > 0).map((c, i) => <Cell key={i} fill={c.color} />)}
                        </Pie>
                        <Tooltip formatter={(v: number, n: string) => [`${v} signups`, n]} contentStyle={{ fontSize: '10px', borderRadius: '8px', border: '1px solid #eaeaea' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                    {channelMetrics.filter(c => c.signups > 0).map(c => (
                      <div key={c.id} className="flex items-center gap-1 text-[8px]"><div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.color }} /><span className="text-[#888]">{c.name}</span></div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ PROJECTIONS ═══ */}
        {activeTab === 'projections' && (
          <div className="space-y-3">
            <div className={cn(cd, "p-3")}>
              <div className="flex items-center justify-between mb-2">
                <span className={sH} style={hk}>{projectionMonths}-Month Projection</span>
                <div className="flex items-center bg-[#f5f5f5] dark:bg-[#1a1a1a] rounded-lg p-0.5">
                  {[1, 6, 12].map(n => (
                    <button key={n} onClick={() => { setProjectionMonths(n); setSelectedMonth(Math.min(selectedMonth, n)); }} className={cn(
                      "px-2.5 py-0.5 text-[9px] font-medium rounded-md transition-colors",
                      projectionMonths === n ? "bg-white dark:bg-[#222] text-[#FF4301] shadow-sm" : "text-[#888] hover:text-[#666]"
                    )}>{n}mo</button>
                  ))}
                </div>
              </div>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={projectionData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }} onClick={(e: any) => e?.activeTooltipIndex !== undefined && setSelectedMonth(e.activeTooltipIndex)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.08} />
                    <XAxis dataKey="month" tick={{ fontSize: 9 }} tickLine={false} />
                    <YAxis tick={{ fontSize: 9 }} tickLine={false} tickFormatter={(v: number) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                    <Tooltip content={<CTip />} />
                    <Legend wrapperStyle={{ fontSize: '9px' }} />
                    <ReferenceLine y={0} stroke="#666" strokeDasharray="3 3" />
                    <ReferenceLine x={MONTH_LABELS[selectedMonth]} stroke="#FF4301" strokeWidth={2} strokeDasharray="4 4" />
                    <Bar dataKey="revenue" name="Revenue" fill="#10b981" opacity={0.7} />
                    <Bar dataKey="costs" name="Costs" fill="#ef4444" opacity={0.5} />
                    <Line type="monotone" dataKey="profit" name="Profit" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className={cn(cd, "p-3 overflow-x-auto")}>
              <div className="flex items-center justify-between mb-2">
                <span className={sH} style={hk}>Monthly Breakdown</span>
                {userBreakdown.some(b => b?.isManual) && (
                  <button onClick={() => setUserBreakdown([])} className="text-[8px] text-[#888] hover:text-[#666] flex items-center gap-1"><RotateCcw className="h-2.5 w-2.5" /> Reset</button>
                )}
              </div>
              <div className="min-w-[800px] space-y-0.5">
                <div className="flex items-center gap-1">
                  <div className="w-20 flex-shrink-0" />
                  {projectionData.slice(0, projectionMonths + 1).map((d, i) => (
                    <div key={i} className="flex-1 text-center">
                      <button onClick={() => setSelectedMonth(i)} className={cn("text-[8px] px-1 py-0.5 rounded", i === selectedMonth ? "text-[#FF4301] font-medium bg-[#FF4301]/5" : "text-[#888]")}>{d.month}</button>
                    </div>
                  ))}
                </div>
                <SD label="USERS" color="text-purple-600" />
                <GR label="Total" data={projectionData} field="users" sm={selectedMonth} />
                <GR label="Free" data={projectionData} field="freeUsers" sm={selectedMonth} c="text-[#888]" />
                <GR label="Starter" data={projectionData} field="starterUsers" sm={selectedMonth} c="text-amber-600" edit onEdit={(i, v) => ub(i, 'starter', v)} ed={userBreakdown} ef="starter" />
                <GR label="Pro" data={projectionData} field="proUsers" sm={selectedMonth} c="text-blue-600" edit onEdit={(i, v) => ub(i, 'pro', v)} ed={userBreakdown} ef="pro" />
                <GR label="Team" data={projectionData} field="teamUsers" sm={selectedMonth} c="text-emerald-600" edit onEdit={(i, v) => ub(i, 'team', v)} ed={userBreakdown} ef="team" />
                <GR label="Enterprise" data={projectionData} field="enterpriseDeals" sm={selectedMonth} c="text-orange-600" edit onEdit={(i, v) => ub(i, 'enterprise', v)} ed={userBreakdown} ef="enterprise" />
                <SR label="Σ Paid" data={projectionData} calc={d => d.paidUsers} sm={selectedMonth} c="text-amber-600" />
                <SD label="REVENUE" color="text-emerald-600" />
                <GR label="Subs" data={projectionData} field="subscriptionRevenue" sm={selectedMonth} c="text-emerald-600" p="$" />
                <GR label="Enterprise" data={projectionData} field="enterpriseRevenue" sm={selectedMonth} c="text-orange-600" p="$" />
                <GR label="Overage" data={projectionData} field="overageRevenue" sm={selectedMonth} c="text-purple-600" p="$" />
                <SR label="Total Rev" data={projectionData} calc={d => d.revenue} sm={selectedMonth} c="text-emerald-600" p="$" />
                <SD label="COSTS" color="text-red-600" />
                <GR label="API" data={projectionData} field="apiCosts" sm={selectedMonth} c="text-red-500" p="$" />
                <GR label="Infra" data={projectionData} field="infraCosts" sm={selectedMonth} c="text-red-400" p="$" />
                <GR label="Services" data={projectionData} field="serviceCosts" sm={selectedMonth} c="text-red-400" p="$" />
                <GR label="Stripe" data={projectionData} field="stripeFees" sm={selectedMonth} c="text-red-400" p="$" />
                <SR label="Total Cost" data={projectionData} calc={d => d.costs} sm={selectedMonth} c="text-red-600" p="$" />
                <SD label="P&L" color="text-blue-600" />
                <SR label="Profit" data={projectionData} calc={d => d.profit} sm={selectedMonth} c="text-blue-600" p="$" signed />
                <SR label="Margin" data={projectionData} calc={d => d.revenue > 0 ? (d.profit / d.revenue) * 100 : 0} sm={selectedMonth} c="text-blue-600" s="%" />
                <SR label="Cum P&L" data={projectionData} calc={d => d.cumProfit} sm={selectedMonth} c="text-blue-600" p="$" signed />
              </div>
            </div>
          </div>
        )}

        {/* ═══ BENCHMARKS ═══ */}
        {activeTab === 'benchmarks' && (
          <div className="space-y-3">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-5">
                <div className={cn(cd, "p-3")}>
                  <span className={sH} style={hk}>Performance vs Industry</span>
                  <div className="h-[300px] mt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={benchmarkScores.map(b => ({ metric: b.name, you: b.pct, industry: 60 }))}>
                        <PolarGrid stroke="#333" opacity={0.15} />
                        <PolarAngleAxis dataKey="metric" tick={{ fontSize: 9, fill: '#888' }} />
                        <PolarRadiusAxis angle={90} tick={false} domain={[0, 100]} />
                        <Radar name="You" dataKey="you" stroke="#FF4301" fill="#FF4301" fillOpacity={0.2} strokeWidth={2} />
                        <Radar name="Industry" dataKey="industry" stroke="#888" fill="#888" fillOpacity={0.05} strokeWidth={1} strokeDasharray="4 4" />
                        <Legend wrapperStyle={{ fontSize: '9px' }} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
              <div className="col-span-7 space-y-3">
                <div className={cn(cd, "p-3")}>
                  <span className={sH} style={hk}>Metric Scorecard</span>
                  <div className="mt-2">
                    <div className="grid grid-cols-6 gap-1 text-[8px] text-[#888] font-medium pb-1 border-b border-[#eaeaea] dark:border-[#333]">
                      <span>Metric</span><span className="text-right">Yours</span><span className="text-right">Bench</span><span className="text-right">Score</span><span className="text-center">Grade</span><span></span>
                    </div>
                    {benchmarkScores.map(b => (
                      <div key={b.name} className="grid grid-cols-6 gap-1 py-2 border-b border-[#eaeaea]/50 dark:border-[#333]/50 items-center text-[9px]">
                        <span className="font-medium">{b.name}</span>
                        <span className="text-right tabular-nums">{b.value.toFixed(1)}{b.unit}</span>
                        <span className="text-right tabular-nums text-[#888]">{b.benchmark}{b.unit}</span>
                        <div className="flex items-center gap-1 justify-end">
                          <div className="w-12 h-1.5 bg-[#f5f5f5] dark:bg-[#1a1a1a] rounded overflow-hidden">
                            <div className="h-full rounded" style={{ width: `${Math.min(100, b.pct)}%`, backgroundColor: b.grade.color }} />
                          </div>
                          <span className="text-[8px] tabular-nums text-[#888]">{b.pct.toFixed(0)}</span>
                        </div>
                        <div className="text-center">
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold" style={{ backgroundColor: b.grade.color + '15', color: b.grade.color }}>{b.grade.letter}</span>
                        </div>
                        <div className="flex items-center">{b.value > b.benchmark ? <ArrowUpRight className="h-3 w-3 text-emerald-500" /> : <ArrowDownRight className="h-3 w-3 text-red-500" />}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-2 border-t border-[#eaeaea] dark:border-[#333] grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-[8px] text-[#888] font-medium mb-1">RULE OF 40</div>
                      <div className="flex items-center gap-2">
                        <span className={cn("text-xl font-bold tabular-nums", (inputs.monthlyGrowthPct * 12 + economics.grossMargin) >= 40 ? "text-emerald-600" : "text-red-500")}>{(inputs.monthlyGrowthPct * 12 + economics.grossMargin).toFixed(0)}</span>
                        <span className="text-[8px] text-[#888]">Growth ({(inputs.monthlyGrowthPct * 12).toFixed(0)}%) + Margin ({economics.grossMargin.toFixed(0)}%)</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[8px] text-[#888] font-medium mb-1">QUICK RATIO</div>
                      <div className="flex items-center gap-2">
                        <span className={cn("text-xl font-bold tabular-nums", inputs.churnPct > 0 ? (inputs.monthlyGrowthPct / inputs.churnPct >= 4 ? "text-emerald-600" : inputs.monthlyGrowthPct / inputs.churnPct >= 2 ? "text-amber-500" : "text-red-500") : "text-emerald-600")}>
                          {inputs.churnPct > 0 ? (inputs.monthlyGrowthPct / inputs.churnPct).toFixed(1) : '∞'}x
                        </span>
                        <span className="text-[8px] text-[#888]">New / Lost MRR (target: 4x+)</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className={cn(cd, "p-3")}>
                  <span className={sH} style={hk}>Industry Comparison</span>
                  <div className="mt-2">
                    <div className="grid grid-cols-7 gap-1 text-[8px] text-[#888] font-medium pb-1 border-b border-[#eaeaea] dark:border-[#333]">
                      <span>Company</span><span className="text-right">F→P</span><span className="text-right">Margin</span><span className="text-right">LTV:CAC</span><span className="text-right">Viral</span><span className="text-right">NRR</span><span className="text-right">Payback</span>
                    </div>
                    <div className="grid grid-cols-7 gap-1 py-1.5 border-b border-[#FF4301]/20 items-center text-[9px] bg-[#FF4301]/[0.03]">
                      <span className="font-bold text-[#FF4301]">NextSlide</span>
                      <span className="text-right tabular-nums font-medium">{effectiveConvPct.toFixed(1)}%</span>
                      <span className="text-right tabular-nums font-medium">{economics.grossMargin.toFixed(0)}%</span>
                      <span className="text-right tabular-nums font-medium">{economics.ltvCac.toFixed(1)}x</span>
                      <span className="text-right tabular-nums font-medium">{viralCoeff.toFixed(2)}</span>
                      <span className="text-right tabular-nums font-medium">{(100 + inputs.monthlyGrowthPct - inputs.churnPct).toFixed(0)}%</span>
                      <span className="text-right tabular-nums font-medium">{economics.paybackMonths < 99 ? `${economics.paybackMonths.toFixed(0)}mo` : 'N/A'}</span>
                    </div>
                    {BENCHMARK_DATA.map(c => (
                      <div key={c.company} className="grid grid-cols-7 gap-1 py-1.5 border-b border-[#eaeaea]/50 dark:border-[#333]/50 items-center text-[9px]">
                        <span className="text-[#888]">{c.company}</span>
                        <span className="text-right tabular-nums text-[#888]">{c.freeToPaid}%</span>
                        <span className="text-right tabular-nums text-[#888]">{c.grossMargin}%</span>
                        <span className="text-right tabular-nums text-[#888]">{c.ltvCac}x</span>
                        <span className="text-right tabular-nums text-[#888]">{c.viral}</span>
                        <span className="text-right tabular-nums text-[#888]">{c.nrr}%</span>
                        <span className="text-right tabular-nums text-[#888]">{c.payback}mo</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayoutV2>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ════════════════════════════════════════════════════════════════════════════════

const KPI = ({ label, value, sub, status }: { label: string; value: string; sub: string; status: 'good' | 'warn' | 'bad' }) => (
  <div className={cn("bg-white dark:bg-[#111] border rounded-xl p-2.5", status === 'bad' ? 'border-red-500/40' : status === 'warn' ? 'border-amber-500/40' : 'border-[#eaeaea] dark:border-[#333]')}>
    <div className="flex items-center gap-1 mb-1">
      <span className={cn("w-1.5 h-1.5 rounded-full", status === 'good' && "bg-emerald-500", status === 'warn' && "bg-amber-500", status === 'bad' && "bg-red-500")} />
      <span className="text-[9px] text-[#888] truncate">{label}</span>
    </div>
    <div className="text-lg font-semibold tabular-nums leading-tight truncate">{value}</div>
    <div className="text-[9px] text-[#888] mt-0.5 truncate">{sub}</div>
  </div>
);

const MR = ({ label, value, status }: { label: string; value: string; status: 'good' | 'warn' | 'bad' }) => (
  <div className="flex items-center justify-between py-1.5 px-2 bg-[#fafafa] dark:bg-[#0a0a0a] rounded">
    <div className="flex items-center gap-1.5">
      <span className={cn("w-1.5 h-1.5 rounded-full", status === 'good' && "bg-emerald-500", status === 'warn' && "bg-amber-500", status === 'bad' && "bg-red-500")} />
      <span className="text-[9px] text-[#888]">{label}</span>
    </div>
    <span className="text-[10px] font-medium tabular-nums">{value}</span>
  </div>
);

const CI = ({ label, value, onChange, step = 1, min, max }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number }) => (
  <div className="flex items-center justify-between">
    <span className="text-[9px] text-[#888]">{label}</span>
    <Input type="number" value={value} onChange={e => onChange(Number(e.target.value))} step={step} min={min} max={max} className="h-5 w-20 text-[10px] text-right px-1" />
  </div>
);

const SD = ({ label, color }: { label: string; color: string }) => (
  <div className="flex items-center gap-1 pt-2 pb-0.5">
    <span className={cn("text-[8px] font-bold", color)}>{label}</span>
    <div className="flex-1 h-px bg-[#eaeaea] dark:bg-[#333]" />
  </div>
);

const GR = ({ label, data, field, sm, c, p, edit, onEdit, ed, ef }: {
  label: string; data: any[]; field: string; sm: number; c?: string; p?: string;
  edit?: boolean; onEdit?: (i: number, v: number) => void; ed?: any[]; ef?: string;
}) => (
  <div className="flex items-center gap-1">
    <div className="w-20 flex-shrink-0"><span className={cn("text-[9px]", c || "text-[#666]")}>{label}</span></div>
    {data.map((d, i) => (
      <div key={i} className="flex-1">
        {edit && onEdit && ed ? (
          <Input type="number" value={ed[i]?.[ef!] ?? d[field] ?? 0} onChange={e => onEdit(i, Number(e.target.value))}
            className={cn("h-5 text-[9px] text-center px-0.5", ed[i]?.isManual && "border-blue-500 bg-blue-500/5", i === sm && "ring-1 ring-[#FF4301]/50")} />
        ) : (
          <div className={cn("h-5 flex items-center justify-center text-[9px] tabular-nums rounded border border-transparent", i === sm && "bg-[#FF4301]/5 border-[#FF4301]/20", c || "text-[#666]")}>
            {p}{typeof d[field] === 'number' ? fmtNum(d[field], p === '$' ? 0 : 0) : d[field]}
          </div>
        )}
      </div>
    ))}
  </div>
);

const SR = ({ label, data, calc, sm, c, p, s, signed }: {
  label: string; data: any[]; calc: (d: any) => number; sm: number; c: string; p?: string; s?: string; signed?: boolean;
}) => (
  <div className="flex items-center gap-1 pt-0.5 border-t border-[#eaeaea]/50 dark:border-[#333]/50">
    <div className="w-20 flex-shrink-0"><span className={cn("text-[9px] font-medium", c)}>{label}</span></div>
    {data.map((d, i) => {
      const v = calc(d);
      return (
        <div key={i} className="flex-1">
          <div className={cn("h-5 flex items-center justify-center text-[9px] tabular-nums font-medium rounded",
            i === sm ? "bg-[#FF4301]/5 border border-[#FF4301]/20" : "border border-transparent",
            signed && v < 0 ? "text-red-600" : c)}>
            {signed && v > 0 ? '+' : ''}{p}{fmtNum(v, s === '%' ? 0 : 0)}{s}
          </div>
        </div>
      );
    })}
  </div>
);

const CTip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  return (
    <div className="bg-white dark:bg-[#1a1a1a] border border-[#eaeaea] dark:border-[#333] rounded-lg p-2 text-[10px] shadow-lg">
      <div className="font-medium mb-1">{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span style={{ color: p.color }}>{p.name}:</span>
          <span className="font-medium tabular-nums">{p.name.includes('User') || p.name === 'Paid' ? fmtNum(p.value) : `$${fmtMoney(p.value)}`}</span>
        </div>
      ))}
    </div>
  );
};

export default AdminCosts;
