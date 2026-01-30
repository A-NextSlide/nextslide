import React, { useState, useEffect, useMemo } from 'react';
import AdminLayoutV2 from '@/components/admin/AdminLayoutV2';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw, Loader2, Target, DollarSign, Users, ChevronDown, ChevronUp, Info, Edit3, RotateCcw, CreditCard, Building2, Server, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFinancialActuals, useUsagePatterns, useAdminOverview } from '@/hooks/useAdminQueries';
import { useAdminData } from '@/context/AdminDataContext';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, ReferenceLine, Area, ComposedChart, Legend
} from 'recharts';

// Model pricing (per 1M tokens) - Dec 2025
const MODEL_COSTS = {
  gemini: { input: 0.15, output: 0.60, name: 'Gemini 3 Flash' },
  perplexity: { input: 1.00, output: 5.00, name: 'Perplexity Sonar Pro' },
  haiku: { input: 0.80, output: 4.00, name: 'Claude Haiku' },
};

// Average tokens per operation (from production logs)
const OP_TOKENS = {
  slideGen: { input: 850, output: 7700, model: 'gemini' },
  themeGen: { input: 500, output: 2000, model: 'gemini' },
  research: { input: 500, output: 2500, model: 'perplexity' },
  edit: { input: 1500, output: 6500, model: 'gemini' },
  routing: { input: 500, output: 300, model: 'haiku' },
};

const calcOpCost = (op: keyof typeof OP_TOKENS) => {
  const { input, output, model } = OP_TOKENS[op];
  const pricing = MODEL_COSTS[model as keyof typeof MODEL_COSTS];
  return (input * pricing.input + output * pricing.output) / 1_000_000;
};

const COSTS = {
  slideGen: calcOpCost('slideGen'),
  themeGen: calcOpCost('themeGen'),
  research: calcOpCost('research'),
  edit: calcOpCost('edit'),
  routing: calcOpCost('routing'),
};

interface PlanConfig {
  name: string;
  price: number;
  tokens: number;
  pctOfPaid: number; // % of paid users on this plan
  isEnterprise?: boolean; // enterprise deals are one-off, not subscription
}

interface EnterpriseConfig {
  dealsPerYear: number;
  avgDealSize: number; // one-time or annual contract value
  // Which months deals close (0-11), empty = spread evenly
  dealMonths: number[];
}

interface EconomicsInputs {
  // Token costs (what we charge users)
  tokensPerSlide: number;
  tokensPerEdit: number;
  tokensPerResearch: number;
  // API costs (our actual costs)
  apiCostPerSlide: number;
  apiCostPerEdit: number;
  apiCostPerResearch: number;
  apiCostPerTheme: number;
  // Usage patterns
  slidesPerDeck: number;
  editsPerDeck: number;
  researchCallsPerDeck: number;
  decksPerActiveUserMonth: number;
  // Free tier
  freeTokens: number;
  freeToPayConvPct: number; // % of free users who upgrade when they hit token limit
  // Growth
  paidConversionPct: number; // % of new users who start as paid (direct conversion)
  monthlyGrowthPct: number;
  churnPct: number;
  cac: number; // CAC per paid-acquired user
  paidAcquisitionPct: number; // % of signups from paid channels (rest is organic)
  // Token consumption rates (% of allocated tokens actually used)
  freeTokenConsumptionPct: number;
  starterTokenConsumptionPct: number;
  proTokenConsumptionPct: number;
  enterpriseTokenConsumptionPct: number;
  // Overage (Pro+ only - Starter must upgrade)
  overageEnabled: boolean;
  overagePctOfProUsers: number; // % of Pro+ users who go over their limit
  overagePricePerToken: number;
  avgOverageTokensPerUser: number;
  // Starter upgrade
  starterUpgradePct: number; // % of Starter users who upgrade to Pro when hitting limit
}

interface MonthlyScenario {
  month: string;
  users: number;
  isManual: boolean;
}

const DEFAULT_PLANS: PlanConfig[] = [
  { name: 'Starter', price: 12, tokens: 500, pctOfPaid: 70 },
  { name: 'Pro', price: 24, tokens: 1500, pctOfPaid: 25 },
  { name: 'Team', price: 49, tokens: 5000, pctOfPaid: 5 },
];

const DEFAULT_ENTERPRISE: EnterpriseConfig = {
  dealsPerYear: 2,
  avgDealSize: 10000, // $10k average enterprise deal
  dealMonths: [], // empty = spread evenly across year
};

// Per-month user breakdown by tier (editable)
interface MonthlyUserBreakdown {
  free: number;
  starter: number;
  pro: number;
  team: number;
  enterprise: number;
  oneOffSpend: number; // One-off enterprise spend (setup fees, custom work)
  isManual: boolean;
}

// Monthly expenses breakdown (editable per month)
interface MonthlyExpenses {
  // Headcount
  headcount: number; // Number of employees
  avgSalary: number; // Average monthly salary per person
  // Infrastructure
  render: number; // Render.com hosting
  supabase: number; // Supabase database
  // APIs & Services
  serpapi: number; // SerpAPI for search
  stripe: number; // Stripe fees (auto-calculated from revenue)
  other: number; // Other misc costs
  isManual: boolean;
}

// Base expense rates (defaults)
interface ExpenseDefaults {
  headcount: number;
  avgSalary: number;
  render: number;
  supabase: number;
  serpapi: number;
  stripePct: number; // Stripe takes % of revenue
  other: number;
}

const DEFAULT_EXPENSE_RATES: ExpenseDefaults = {
  headcount: 1, // Default 1 person
  avgSalary: 0, // $0/mo default (bootstrapped)
  render: 25, // Render starter ~$25/mo
  supabase: 25, // Supabase Pro $25/mo
  serpapi: 50, // SerpAPI $50/mo for 5000 searches
  stripePct: 2.9, // Stripe 2.9% + $0.30 per txn
  other: 50, // Buffer for misc
};

const DEFAULT_INPUTS: EconomicsInputs = {
  tokensPerSlide: 5,
  tokensPerEdit: 5,
  tokensPerResearch: 5,
  apiCostPerSlide: 0.045, // $0.045 per slide
  apiCostPerEdit: 0.03, // $0.03 per edit
  apiCostPerResearch: 0.005, // $0.005 per research call
  apiCostPerTheme: 0.005, // $0.005 per theme/design
  slidesPerDeck: 10,
  editsPerDeck: 2,
  researchCallsPerDeck: 1,
  decksPerActiveUserMonth: 3,
  freeTokens: 50,
  freeToPayConvPct: 10, // 10% of free users upgrade when they hit their limit
  paidConversionPct: 2, // 2% of new users start as paid directly
  monthlyGrowthPct: 10,
  churnPct: 5,
  cac: 10, // CAC per paid-acquired user (one-time)
  paidAcquisitionPct: 20, // Only 20% of signups come from paid channels (rest is organic/viral)
  // Token consumption (% of allocated tokens actually used)
  freeTokenConsumptionPct: 80, // Free users use 80% of their trial tokens
  starterTokenConsumptionPct: 60, // Starter users use 60% of their plan
  proTokenConsumptionPct: 75, // Pro users use 75% of their plan
  enterpriseTokenConsumptionPct: 50, // Enterprise uses 50% (over-provisioned)
  // Overage
  overageEnabled: false,
  overagePctOfProUsers: 20, // 20% of Pro+ users go over their limit
  overagePricePerToken: 0.10, // $0.10 per extra token
  avgOverageTokensPerUser: 50, // average extra tokens used by overage users
  starterUpgradePct: 15, // 15% of Starter users upgrade to Pro when hitting limit
};

const MONTH_LABELS = ['Now', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11', 'M12'];

// Format money with max 2 decimals, use K/M for large numbers
const fmtMoney = (n: number, decimals = 2): string => {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `${(n / 1_000).toFixed(0)}K`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(decimals);
};

// Format number with max decimals
const fmtNum = (n: number, decimals = 0): string => {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `${(n / 1_000).toFixed(0)}K`;
  if (Math.abs(n) >= 1_000) return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
  return n.toFixed(decimals);
};

const STORAGE_KEY = 'admin_costs_inputs';
const PLANS_STORAGE_KEY = 'admin_costs_plans';

// Load from localStorage with fallback
const loadFromStorage = <T,>(key: string, fallback: T): T => {
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved);
      // For arrays, return parsed directly if it's an array, otherwise fallback
      if (Array.isArray(fallback)) {
        return Array.isArray(parsed) ? parsed : fallback;
      }
      // For objects, merge with fallback to handle new fields
      return { ...fallback, ...parsed };
    }
  } catch (e) {
    console.warn('Failed to load from localStorage:', e);
  }
  return fallback;
};

const ENTERPRISE_STORAGE_KEY = 'admin_costs_enterprise';
const USER_BREAKDOWN_STORAGE_KEY = 'admin_costs_user_breakdown';
const EXPENSES_STORAGE_KEY = 'admin_costs_expenses';
const EXPENSE_RATES_STORAGE_KEY = 'admin_costs_expense_rates';

const AdminCosts: React.FC = () => {
  const { dateRange } = useAdminData();
  const [inputs, setInputs] = useState<EconomicsInputs>(() => loadFromStorage(STORAGE_KEY, DEFAULT_INPUTS));
  const [plans, setPlans] = useState<PlanConfig[]>(() => loadFromStorage(PLANS_STORAGE_KEY, DEFAULT_PLANS));
  const [enterprise, setEnterprise] = useState<EnterpriseConfig>(() => loadFromStorage(ENTERPRISE_STORAGE_KEY, DEFAULT_ENTERPRISE));
  const [userBreakdown, setUserBreakdown] = useState<MonthlyUserBreakdown[]>([]);
  const [expenseRates, setExpenseRates] = useState<ExpenseDefaults>(() => loadFromStorage(EXPENSE_RATES_STORAGE_KEY, DEFAULT_EXPENSE_RATES));
  const [monthlyExpenses, setMonthlyExpenses] = useState<MonthlyExpenses[]>([]);
  const [breakdownTab, setBreakdownTab] = useState<'users' | 'expenses'>('users');

  // Save inputs to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs));
    } catch (e) {
      console.warn('Failed to save inputs to localStorage:', e);
    }
  }, [inputs]);

  // Save plans to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem(PLANS_STORAGE_KEY, JSON.stringify(plans));
    } catch (e) {
      console.warn('Failed to save plans to localStorage:', e);
    }
  }, [plans]);

  // Save enterprise to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(ENTERPRISE_STORAGE_KEY, JSON.stringify(enterprise));
    } catch (e) {
      console.warn('Failed to save enterprise to localStorage:', e);
    }
  }, [enterprise]);

  // Save user breakdown to localStorage
  useEffect(() => {
    if (userBreakdown.length > 0) {
      try {
        localStorage.setItem(USER_BREAKDOWN_STORAGE_KEY, JSON.stringify(userBreakdown));
      } catch (e) {
        console.warn('Failed to save user breakdown to localStorage:', e);
      }
    }
  }, [userBreakdown]);

  // Save expense rates to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(EXPENSE_RATES_STORAGE_KEY, JSON.stringify(expenseRates));
    } catch (e) {
      console.warn('Failed to save expense rates to localStorage:', e);
    }
  }, [expenseRates]);

  // Save monthly expenses to localStorage
  useEffect(() => {
    if (monthlyExpenses.length > 0) {
      try {
        localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(monthlyExpenses));
      } catch (e) {
        console.warn('Failed to save expenses to localStorage:', e);
      }
    }
  }, [monthlyExpenses]);

  const [showModelCosts, setShowModelCosts] = useState(false);
  const [showPlanConfig, setShowPlanConfig] = useState(true);
  const [projectionMonths, setProjectionMonths] = useState(6);
  const [chartView, setChartView] = useState<'combined' | 'users' | 'financials'>('combined');
  const [selectedMonth, setSelectedMonth] = useState(6);
  const [manualScenario, setManualScenario] = useState<MonthlyScenario[]>([]);

  // Fetch real data
  const { data: actuals, isLoading: actualsLoading, refetch } = useFinancialActuals(
    dateRange.startDate,
    dateRange.endDate
  );
  const { data: patterns } = useUsagePatterns(dateRange.startDate, dateRange.endDate);
  const { data: overview } = useAdminOverview(dateRange.startDate, dateRange.endDate);

  // Get real metrics
  const totalUsers = actuals?.users?.total || overview?.metrics?.users?.total || 0;
  const activeUsers = actuals?.users?.active_30d || Math.ceil(totalUsers * 0.3);
  const realPaidUsers = actuals?.revenue?.paidUsers || 0;
  const realMRR = actuals?.revenue?.mrr || 0;
  const realARPU = actuals?.revenue?.arpu || 0;

  // Calculate scenario from growth rate, respecting manual overrides
  useEffect(() => {
    if (totalUsers > 0) {
      const { monthlyGrowthPct, churnPct } = inputs;
      const netGrowth = (monthlyGrowthPct - churnPct) / 100;

      setManualScenario(prev => {
        const updated: MonthlyScenario[] = [];
        let calculatedUsers = totalUsers;

        for (let i = 0; i <= 12; i++) {
          if (i > 0) calculatedUsers = Math.round(totalUsers * Math.pow(1 + netGrowth, i));

          // Keep manual values, update calculated ones
          const existing = prev[i];
          if (existing?.isManual) {
            updated.push(existing);
          } else {
            updated.push({ month: MONTH_LABELS[i], users: calculatedUsers, isManual: false });
          }
        }
        return updated;
      });
    }
  }, [totalUsers, inputs.monthlyGrowthPct, inputs.churnPct]);

  // Initialize user breakdown based on total users and plan percentages
  useEffect(() => {
    if (manualScenario.length === 0) return;

    const { paidConversionPct, freeToPayConvPct } = inputs;
    const directPaidPct = paidConversionPct / 100;
    const freeToPaidPct = ((100 - paidConversionPct) / 100) * (freeToPayConvPct / 100);
    const effectiveConvPct = (directPaidPct + freeToPaidPct) * 100;

    // Find plan percentages
    const starterPlan = plans.find(p => p.name.toLowerCase().includes('starter')) || plans[0];
    const proPlan = plans.find(p => p.name.toLowerCase().includes('pro')) || plans[1];
    const teamPlan = plans.find(p => p.name.toLowerCase().includes('team')) || plans[2];

    setUserBreakdown(prev => {
      const updated: MonthlyUserBreakdown[] = [];

      for (let i = 0; i <= 12; i++) {
        const totalU = manualScenario[i]?.users || 0;
        const paidU = Math.round(totalU * (effectiveConvPct / 100));
        const freeU = totalU - paidU;

        // Check if we have manual overrides
        const existing = prev[i];
        if (existing?.isManual) {
          updated.push(existing);
        } else {
          // Calculate based on plan percentages
          const starterU = Math.round(paidU * ((starterPlan?.pctOfPaid || 70) / 100));
          const proU = Math.round(paidU * ((proPlan?.pctOfPaid || 25) / 100));
          const teamU = Math.round(paidU * ((teamPlan?.pctOfPaid || 5) / 100));
          // Enterprise deals are separate, not % based
          const enterpriseU = i === 0 ? 0 : Math.floor(enterprise.dealsPerYear * (i / 12));

          updated.push({
            free: freeU,
            starter: starterU,
            pro: proU,
            team: teamU,
            enterprise: enterpriseU,
            oneOffSpend: 0, // One-off enterprise spend (setup fees, etc)
            isManual: false,
          });
        }
      }
      return updated;
    });
  }, [manualScenario, inputs.paidConversionPct, inputs.freeToPayConvPct, plans, enterprise.dealsPerYear]);

  // Initialize monthly expenses based on projectionData revenue (for Stripe fees)
  useEffect(() => {
    if (manualScenario.length === 0) return;

    setMonthlyExpenses(prev => {
      const updated: MonthlyExpenses[] = [];

      for (let i = 0; i <= 12; i++) {
        const existing = prev[i];
        if (existing?.isManual) {
          updated.push(existing);
        } else {
          // Default expenses based on expenseRates
          updated.push({
            headcount: expenseRates.headcount,
            avgSalary: expenseRates.avgSalary,
            render: expenseRates.render,
            supabase: expenseRates.supabase,
            serpapi: expenseRates.serpapi,
            stripe: 0, // Will be calculated from revenue
            other: expenseRates.other,
            isManual: false,
          });
        }
      }
      return updated;
    });
  }, [manualScenario, expenseRates]);

  // Track if inputs were initialized from patterns (only apply once)
  const [patternsApplied, setPatternsApplied] = useState(false);

  // Update inputs from real patterns - only on first load
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
    if (actuals?.revenue?.paidUsers && actuals?.users?.total) {
      const realConversion = (actuals.revenue.paidUsers / actuals.users.total) * 100;
      if (realConversion > 0) {
        setInputs(prev => ({ ...prev, paidConversionPct: Math.round(realConversion * 10) / 10 }));
      }
    }
  }, [patterns, actuals, patternsApplied]);

  // Calculate tokens per deck
  const tokensPerDeck = useMemo(() => {
    const { tokensPerSlide, tokensPerEdit, tokensPerResearch, slidesPerDeck, editsPerDeck, researchCallsPerDeck } = inputs;
    return (slidesPerDeck * tokensPerSlide) + (editsPerDeck * tokensPerEdit) + (researchCallsPerDeck * tokensPerResearch);
  }, [inputs]);

  // Calculate blended ARPU from plans
  const blendedARPU = useMemo(() => {
    return plans.reduce((sum, p) => sum + (p.price * p.pctOfPaid / 100), 0);
  }, [plans]);

  // Calculate blended tokens per paid user
  const blendedTokensPerPaidUser = useMemo(() => {
    return plans.reduce((sum, p) => sum + (p.tokens * p.pctOfPaid / 100), 0);
  }, [plans]);

  // Calculate blended decks per paid user (blend at deck level, not token level)
  const blendedDecksPerPaidUser = useMemo(() => {
    if (tokensPerDeck === 0) return 0;
    return plans.reduce((sum, p) => {
      const decksForPlan = Math.floor(p.tokens / tokensPerDeck);
      return sum + (decksForPlan * p.pctOfPaid / 100);
    }, 0);
  }, [plans, tokensPerDeck]);

  // Calculate Pro+ percentage (all plans except Starter/first plan can have overage)
  const proPlusPct = useMemo(() => {
    if (plans.length <= 1) return 0;
    // Sum all plans except the first one (Starter)
    return plans.slice(1).reduce((sum, p) => sum + p.pctOfPaid, 0);
  }, [plans]);

  // Starter percentage (first plan - must upgrade when hitting limit)
  const starterPct = useMemo(() => {
    return plans.length > 0 ? plans[0].pctOfPaid : 100;
  }, [plans]);

  // Get consumption rate for a plan based on its index/name
  const getConsumptionRate = (planIndex: number, planName: string) => {
    const name = planName.toLowerCase();
    if (name.includes('enterprise') || name.includes('team')) {
      return inputs.enterpriseTokenConsumptionPct / 100;
    }
    if (name.includes('pro')) {
      return inputs.proTokenConsumptionPct / 100;
    }
    if (planIndex === 0 || name.includes('starter') || name.includes('basic')) {
      return inputs.starterTokenConsumptionPct / 100;
    }
    // Default to pro rate for unknown plans
    return inputs.proTokenConsumptionPct / 100;
  };

  // Calculate blended consumption-adjusted decks per paid user (for NORMAL users who don't go over)
  const blendedActualDecksPerPaidUser = useMemo(() => {
    if (tokensPerDeck === 0) return 0;
    return plans.reduce((sum, p, i) => {
      const consumptionRate = getConsumptionRate(i, p.name);
      const tokensActuallyUsed = p.tokens * consumptionRate;
      const decksForPlan = tokensActuallyUsed / tokensPerDeck;
      return sum + (decksForPlan * p.pctOfPaid / 100);
    }, 0);
  }, [plans, tokensPerDeck, inputs.starterTokenConsumptionPct, inputs.proTokenConsumptionPct, inputs.enterpriseTokenConsumptionPct]);

  // Calculate blended decks for OVERAGE users (they use 100% of their allocation, then buy more)
  const blendedDecksPerOverageUser = useMemo(() => {
    if (tokensPerDeck === 0) return 0;
    // Overage users are Pro+ only, so only include non-Starter plans
    return plans.slice(1).reduce((sum, p) => {
      const decksForPlan = p.tokens / tokensPerDeck; // 100% consumption
      // Weight by this plan's share of Pro+ users (not all paid users)
      const proPlusShare = p.pctOfPaid / proPlusPct * 100;
      return sum + (decksForPlan * proPlusShare / 100);
    }, 0);
  }, [plans, tokensPerDeck, proPlusPct]);

  // Calculate cost per deck using editable API costs
  const costPerDeck = useMemo(() => {
    const { slidesPerDeck, editsPerDeck, researchCallsPerDeck, apiCostPerSlide, apiCostPerEdit, apiCostPerResearch, apiCostPerTheme } = inputs;
    return (
      apiCostPerTheme +
      (slidesPerDeck * apiCostPerSlide) +
      (researchCallsPerDeck * apiCostPerResearch) +
      (editsPerDeck * apiCostPerEdit) +
      (3 * COSTS.routing) // routing is minimal, keep static
    );
  }, [inputs]);

  // Calculate economics with token-based model
  // Uses userBreakdown for tier counts (allows manual editing)
  // Enterprise deals are one-off and tracked separately
  const economics = useMemo(() => {
    const {
      decksPerActiveUserMonth, paidConversionPct, freeToPayConvPct, churnPct, cac, freeTokens,
      overageEnabled, overagePctOfProUsers, overagePricePerToken, avgOverageTokensPerUser,
      starterUpgradePct, freeTokenConsumptionPct
    } = inputs;

    // Free users: get tokens ONCE (not monthly), but only use X% of them
    const freeTokensActuallyUsed = freeTokens * (freeTokenConsumptionPct / 100);
    const freeDecksOneTime = tokensPerDeck > 0 ? freeTokensActuallyUsed / tokensPerDeck : 0;

    // Paid users: limited by their plan's tokens (monthly), adjusted for consumption rate
    const paidDecksPerUserMonth = Math.min(decksPerActiveUserMonth, blendedActualDecksPerPaidUser);

    // User funnel calculation for effective conversion rate display
    const directPaidPct = paidConversionPct / 100;
    const freeToPaidPct = ((100 - paidConversionPct) / 100) * (freeToPayConvPct / 100);
    const effectivePaidConversionPct = (directPaidPct + freeToPaidPct) * 100;

    // Get user counts from userBreakdown (month 0 = current state)
    const currentBreakdown = userBreakdown[0] || { free: 0, starter: 0, pro: 0, team: 0, enterprise: 0, isManual: false };
    const starterUsers = currentBreakdown.starter;
    const proUsers = currentBreakdown.pro;
    const teamUsers = currentBreakdown.team;
    const enterpriseDeals = currentBreakdown.enterprise;
    const freeUsers = currentBreakdown.free;

    // Pro+ = Pro + Team (excludes enterprise)
    const proPlusUsers = proUsers + teamUsers;
    const estPaidUsers = starterUsers + proPlusUsers; // Subscription users
    const activeProPlusUsers = Math.ceil(proPlusUsers * 0.7);

    // Free user costs: new signups each month use their free trial
    const newSignupsPerMonth = Math.round(totalUsers * (inputs.monthlyGrowthPct / 100));
    const newFreeTrialUsers = Math.round(newSignupsPerMonth * (1 - directPaidPct));
    const freeTrialCostMonthly = newFreeTrialUsers * freeDecksOneTime * costPerDeck;

    // Plan info for pricing
    const proPlan = plans.find(p => p.name.toLowerCase().includes('pro')) || plans[1];
    const starterPlan = plans.find(p => p.name.toLowerCase().includes('starter')) || plans[0];
    const teamPlan = plans.find(p => p.name.toLowerCase().includes('team')) || plans[2];

    // Starter upgrade revenue: X% of Starter users upgrade to Pro when hitting limit
    const starterUpgradeUsers = Math.round(starterUsers * (starterUpgradePct / 100));
    const upgradeRevenue = proPlan && starterPlan ? starterUpgradeUsers * (proPlan.price - starterPlan.price) : 0;

    // Customer acquisition cost (CAC) - only applies to paid-acquired users, not organic/viral
    const paidAcquiredUsers = Math.round(newSignupsPerMonth * (inputs.paidAcquisitionPct / 100));
    const acquisitionCostMonthly = paidAcquiredUsers * cac;

    // Monthly costs - split by user type:
    const activeStarterUsers = Math.ceil(starterUsers * 0.7);
    const starterDecksPerUser = Math.min(decksPerActiveUserMonth, blendedActualDecksPerPaidUser);
    const starterCostMonthly = activeStarterUsers * starterDecksPerUser * costPerDeck;

    // Pro+ split: normal vs overage users
    const overageUsers = overageEnabled ? Math.ceil(activeProPlusUsers * (overagePctOfProUsers / 100)) : 0;
    const normalProPlusUsers = activeProPlusUsers - overageUsers;

    // Normal Pro+ users: use consumption-adjusted decks
    const normalProPlusDecksPerUser = Math.min(decksPerActiveUserMonth, blendedActualDecksPerPaidUser);
    const normalProPlusCostMonthly = normalProPlusUsers * normalProPlusDecksPerUser * costPerDeck;

    // Overage Pro+ users: use 100% of their allocation, then buy more
    const overageBaseDecksPerUser = blendedDecksPerOverageUser;
    const overageBaseCostMonthly = overageUsers * overageBaseDecksPerUser * costPerDeck;

    // Plus their overage tokens
    const overageTokensTotal = overageUsers * avgOverageTokensPerUser;
    const costPerToken = tokensPerDeck > 0 ? costPerDeck / tokensPerDeck : 0;
    const overageExtraCost = overageEnabled ? overageTokensTotal * costPerToken : 0;

    // Enterprise costs (they consume tokens too)
    const enterpriseTokensPerUser = 5000 * (inputs.enterpriseTokenConsumptionPct / 100);
    const enterpriseDecksPerUser = tokensPerDeck > 0 ? enterpriseTokensPerUser / tokensPerDeck : 0;
    const enterpriseCostMonthly = enterpriseDeals * enterpriseDecksPerUser * costPerDeck;

    const paidUserCostMonthly = starterCostMonthly + normalProPlusCostMonthly + overageBaseCostMonthly + overageExtraCost + enterpriseCostMonthly;
    const monthlyCost = paidUserCostMonthly + freeTrialCostMonthly + acquisitionCostMonthly;

    // Revenue: subscription tiers × their prices
    const starterRevenue = starterUsers * (starterPlan?.price || 9);
    const proRevenue = proUsers * (proPlan?.price || 19);
    const teamRevenue = teamUsers * (teamPlan?.price || 49);
    const subscriptionRevenue = starterRevenue + proRevenue + teamRevenue;

    // Enterprise revenue: for current month (0), show amortized annual value / 12
    const enterpriseAnnualValue = enterprise.dealsPerYear * enterprise.avgDealSize;
    const enterpriseMonthlyAmortized = enterpriseAnnualValue / 12;

    // Overage revenue (if enabled)
    const overageRevenue = overageEnabled ? overageTokensTotal * overagePricePerToken : 0;
    const overageCost = overageEnabled ? (overageBaseCostMonthly - (overageUsers * normalProPlusDecksPerUser * costPerDeck)) + overageExtraCost : 0;

    const estMRR = subscriptionRevenue + overageRevenue + upgradeRevenue + enterpriseMonthlyAmortized;
    const totalMonthlyCost = monthlyCost;

    // Margins - based on all paying users
    const totalPayingUsers = estPaidUsers + enterpriseDeals;
    const grossMargin = estMRR > 0 ? ((estMRR - totalMonthlyCost) / estMRR) * 100 : 0;
    const costPerPaidUser = totalPayingUsers > 0 ? totalMonthlyCost / totalPayingUsers : 0;
    const revenuePerPaidUser = totalPayingUsers > 0 ? estMRR / totalPayingUsers : blendedARPU;
    const profitPerPaidUser = revenuePerPaidUser - costPerPaidUser;

    // LTV/CAC
    const avgLifetimeMonths = churnPct > 0 ? (100 / churnPct) : 24;
    const ltv = revenuePerPaidUser * avgLifetimeMonths;
    const ltvCac = cac > 0 ? ltv / cac : 0;

    // Break-even
    const breakEvenPaidUsers = profitPerPaidUser > 0 ? Math.ceil(totalMonthlyCost / profitPerPaidUser) : 0;
    const paybackMonths = cac > 0 && profitPerPaidUser > 0 ? cac / profitPerPaidUser : 99;

    return {
      costPerDeck, tokensPerDeck, freeDecksOneTime, paidDecksPerUserMonth,
      totalCost: totalMonthlyCost,
      estPaidUsers: totalPayingUsers, freeUsers, estMRR, subscriptionRevenue, overageRevenue, overageCost,
      enterpriseRevenue: enterpriseMonthlyAmortized, enterpriseDeals,
      grossMargin, ltv, ltvCac, effectivePaidConversionPct,
      breakEvenPaidUsers, paybackMonths, netMonthly: estMRR - totalMonthlyCost,
      costPerPaidUser, profitPerPaidUser, blendedARPU: revenuePerPaidUser,
      freeTrialCostMonthly, newFreeTrialUsers,
      // Plan breakdown
      starterUsers, proPlusUsers, activeProPlusUsers, overageUsers, overageTokensTotal,
      upgradeRevenue, starterUpgradeUsers,
    };
  }, [inputs, costPerDeck, tokensPerDeck, totalUsers, blendedARPU, blendedActualDecksPerPaidUser, blendedDecksPerOverageUser, plans, userBreakdown, enterprise]);

  // Generate projection data - uses userBreakdown for tier counts
  // Enterprise revenue is separate (one-off deals, not subscription MRR)
  const projectionData = useMemo(() => {
    const {
      decksPerActiveUserMonth,
      overageEnabled, overagePctOfProUsers, overagePricePerToken, avgOverageTokensPerUser,
      starterUpgradePct, freeTokenConsumptionPct, paidConversionPct
    } = inputs;
    const data = [];

    // Paid users: limited by their plan's tokens (monthly), adjusted for consumption
    const paidDecksPerU = Math.min(decksPerActiveUserMonth, blendedActualDecksPerPaidUser);

    // Get plan info for pricing
    const proPlan = plans.find(p => p.name.toLowerCase().includes('pro')) || plans[1];
    const starterPlan = plans.find(p => p.name.toLowerCase().includes('starter')) || plans[0];
    const teamPlan = plans.find(p => p.name.toLowerCase().includes('team')) || plans[2];
    const upgradePriceDiff = proPlan && starterPlan ? proPlan.price - starterPlan.price : 0;

    let cumRevenue = 0;
    let cumCosts = 0;
    let cumEnterpriseRev = 0;

    for (let i = 0; i <= projectionMonths; i++) {
      const users = manualScenario[i]?.users || totalUsers;
      const prevUsers = i > 0 ? (manualScenario[i-1]?.users || totalUsers) : 0;
      const newSignups = i === 0 ? users : Math.max(0, users - prevUsers);

      // Use userBreakdown for tier counts (editable values)
      const breakdown = userBreakdown[i] || { free: 0, starter: 0, pro: 0, team: 0, enterprise: 0, oneOffSpend: 0, isManual: false };
      const starterU = breakdown.starter;
      const proU = breakdown.pro;
      const teamU = breakdown.team;
      const enterpriseDeals = breakdown.enterprise;
      const freeU = breakdown.free;
      const oneOffSpend = breakdown.oneOffSpend || 0;

      // Get operating expenses for this month
      const expenses = monthlyExpenses[i] || { headcount: 1, avgSalary: 0, render: 25, supabase: 25, serpapi: 50, stripe: 0, other: 50, isManual: false };

      // Pro+ = Pro + Team (excludes enterprise deals which are one-off)
      const proPlusU = proU + teamU;
      const paidU = starterU + proPlusU; // Subscription users only (no enterprise)
      const activeStarterU = Math.ceil(starterU * 0.7);
      const activeProPlusU = Math.ceil(proPlusU * 0.7);

      // Paid user costs - split by consumption behavior:
      // 1. Starter users: consumption-adjusted
      const starterCosts = activeStarterU * paidDecksPerU * costPerDeck;

      // 2. Pro+ users: split into normal (consumption-adjusted) vs overage (100% + extra)
      const overageU = overageEnabled ? Math.ceil(activeProPlusU * (overagePctOfProUsers / 100)) : 0;
      const normalProPlusU = activeProPlusU - overageU;

      // Normal Pro+ users: consumption-adjusted
      const normalProPlusCosts = normalProPlusU * paidDecksPerU * costPerDeck;

      // Overage Pro+ users: use 100% of allocation (they max out) + extra tokens
      const overageBaseDecks = blendedDecksPerOverageUser; // 100% consumption for Pro+
      const overageBaseCosts = overageU * overageBaseDecks * costPerDeck;
      const overageTokens = overageU * avgOverageTokensPerUser;
      const costPerToken = tokensPerDeck > 0 ? costPerDeck / tokensPerDeck : 0;
      const overageExtraCosts = overageEnabled ? overageTokens * costPerToken : 0;

      const paidCosts = starterCosts + normalProPlusCosts + overageBaseCosts + overageExtraCosts;

      // Enterprise costs: enterprise users consume tokens too (at enterprise consumption rate)
      const enterpriseTokensPerUser = 5000 * (inputs.enterpriseTokenConsumptionPct / 100); // Assume 5000 tokens
      const enterpriseDecksPerUser = tokensPerDeck > 0 ? enterpriseTokensPerUser / tokensPerDeck : 0;
      const enterpriseCosts = enterpriseDeals * enterpriseDecksPerUser * costPerDeck;

      // Free trial costs: new signups who don't go straight to paid (with consumption rate)
      const newFreeTrialU = Math.round(newSignups * (1 - paidConversionPct / 100));
      const freeTokensUsed = inputs.freeTokens * (freeTokenConsumptionPct / 100);
      const freeDecks = tokensPerDeck > 0 ? freeTokensUsed / tokensPerDeck : 0;
      const freeTrialCosts = newFreeTrialU * freeDecks * costPerDeck;

      // Customer acquisition cost - only for paid-acquired users
      const paidAcquiredU = Math.round(newSignups * (inputs.paidAcquisitionPct / 100));
      const acquisitionCosts = paidAcquiredU * inputs.cac;

      // API costs subtotal
      const apiCosts = paidCosts + enterpriseCosts + freeTrialCosts + acquisitionCosts;

      // Operating expenses
      const headcountCosts = expenses.headcount * expenses.avgSalary;
      const infraCosts = expenses.render + expenses.supabase;
      const apiServiceCosts = expenses.serpapi + expenses.other;
      // One-off spend from enterprise section
      const totalOneOffSpend = oneOffSpend;

      // Total costs = API costs + Operating expenses + One-off spend
      const monthCosts = apiCosts + headcountCosts + infraCosts + apiServiceCosts + totalOneOffSpend;

      // Subscription revenue: each tier × price
      const starterRev = starterU * (starterPlan?.price || 9);
      const proRev = proU * (proPlan?.price || 19);
      const teamRev = teamU * (teamPlan?.price || 49);
      const subscriptionRev = starterRev + proRev + teamRev;

      // Enterprise revenue: one-off deals - cumulative deals × avg deal size / 12 (amortized monthly)
      // Or, if we want revenue in the month deals close: new deals this month × avgDealSize
      const prevEnterpriseDeals = i > 0 ? (userBreakdown[i-1]?.enterprise || 0) : 0;
      const newDealsThisMonth = Math.max(0, enterpriseDeals - prevEnterpriseDeals);
      const enterpriseRevThisMonth = newDealsThisMonth * enterprise.avgDealSize;
      cumEnterpriseRev += enterpriseRevThisMonth;

      // Starter upgrade revenue: X% of Starter users upgrade to Pro
      const starterUpgradeU = Math.round(starterU * (starterUpgradePct / 100));
      const upgradeRev = starterUpgradeU * upgradePriceDiff;

      // Overage revenue
      const overageRev = overageEnabled ? overageTokens * overagePricePerToken : 0;

      const monthRevenue = subscriptionRev + overageRev + upgradeRev + enterpriseRevThisMonth;

      // Stripe fees: 2.9% + $0.30 per transaction (approx as % of revenue)
      const stripeFees = expenses.isManual ? expenses.stripe : monthRevenue * (expenseRates.stripePct / 100);

      const totalMonthCosts = monthCosts + stripeFees;

      cumRevenue += monthRevenue;
      cumCosts += totalMonthCosts;

      data.push({
        month: MONTH_LABELS[i],
        monthIndex: i,
        users,
        paidUsers: paidU + enterpriseDeals, // Total paying (subscriptions + enterprise)
        freeUsers: freeU,
        starterUsers: starterU,
        proUsers: proU,
        teamUsers: teamU,
        enterpriseDeals,
        proPlusUsers: proPlusU,
        revenue: monthRevenue,
        subscriptionRevenue: subscriptionRev,
        enterpriseRevenue: enterpriseRevThisMonth,
        overageRevenue: overageRev,
        // Cost breakdown
        apiCosts,
        headcountCosts,
        infraCosts,
        apiServiceCosts,
        stripeFees,
        oneOffSpend: totalOneOffSpend,
        costs: totalMonthCosts,
        profit: monthRevenue - totalMonthCosts,
        cumRevenue,
        cumCosts,
        cumProfit: cumRevenue - cumCosts,
        cumEnterpriseRev,
      });
    }
    return data;
  }, [inputs, totalUsers, costPerDeck, tokensPerDeck, blendedActualDecksPerPaidUser, blendedDecksPerOverageUser, projectionMonths, manualScenario, plans, userBreakdown, enterprise.avgDealSize, monthlyExpenses, expenseRates.stripePct]);

  // Selected month data
  const selectedData = projectionData[selectedMonth] || projectionData[projectionData.length - 1];

  // Cost breakdown using editable values
  const costBreakdown = useMemo(() => {
    const { slidesPerDeck, editsPerDeck, researchCallsPerDeck, apiCostPerSlide, apiCostPerEdit, apiCostPerResearch, apiCostPerTheme } = inputs;
    const items = [
      { name: 'Slides', cost: slidesPerDeck * apiCostPerSlide },
      { name: 'Theme', cost: apiCostPerTheme },
      { name: 'Research', cost: researchCallsPerDeck * apiCostPerResearch },
      { name: 'Edits', cost: editsPerDeck * apiCostPerEdit },
      { name: 'Routing', cost: 3 * COSTS.routing },
    ];
    const total = items.reduce((s, i) => s + i.cost, 0);
    return items.map(item => ({ ...item, pct: total > 0 ? (item.cost / total) * 100 : 0 }));
  }, [inputs]);

  // Annual metrics - based on selected month's projections
  const annualMetrics = useMemo(() => {
    const monthData = selectedData || projectionData[projectionData.length - 1];
    if (!monthData) {
      return { arr: 0, annualCosts: 0, annualProfit: 0, annualGrossMargin: 0 };
    }
    const arr = monthData.revenue * 12;
    const annualCosts = monthData.costs * 12;
    const annualProfit = monthData.profit * 12;
    const annualGrossMargin = arr > 0 ? (annualProfit / arr) * 100 : 0;
    return { arr, annualCosts, annualProfit, annualGrossMargin };
  }, [selectedData, projectionData]);

  const updateInput = <K extends keyof EconomicsInputs>(key: K, value: number) => {
    setInputs(prev => ({ ...prev, [key]: value }));
  };

  const updatePlan = (index: number, field: keyof PlanConfig, value: number | string) => {
    setPlans(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      // Normalize pctOfPaid if needed
      if (field === 'pctOfPaid') {
        const total = updated.reduce((sum, p) => sum + p.pctOfPaid, 0);
        if (total !== 100) {
          // Auto-adjust others proportionally
          const others = updated.filter((_, i) => i !== index);
          const othersTotal = others.reduce((sum, p) => sum + p.pctOfPaid, 0);
          if (othersTotal > 0) {
            const remaining = 100 - (value as number);
            others.forEach((p, i) => {
              const otherIndex = updated.findIndex(u => u.name === p.name);
              updated[otherIndex].pctOfPaid = Math.round((p.pctOfPaid / othersTotal) * remaining);
            });
          }
        }
      }
      return updated;
    });
  };

  const updateManualUsers = (index: number, value: number) => {
    setManualScenario(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], users: value, isManual: true };
      return updated;
    });
  };

  // Update a specific tier count for a specific month
  const updateUserBreakdown = (index: number, tier: keyof MonthlyUserBreakdown, value: number) => {
    if (tier === 'isManual') return;
    setUserBreakdown(prev => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = { ...updated[index], [tier]: value, isManual: true };
      }
      return updated;
    });
  };

  // Update enterprise config
  const updateEnterprise = <K extends keyof EnterpriseConfig>(key: K, value: EnterpriseConfig[K]) => {
    setEnterprise(prev => ({ ...prev, [key]: value }));
  };

  // Update expense rates (default values)
  const updateExpenseRate = <K extends keyof ExpenseDefaults>(key: K, value: ExpenseDefaults[K]) => {
    setExpenseRates(prev => ({ ...prev, [key]: value }));
  };

  // Update a specific expense field for a specific month
  const updateMonthlyExpense = (index: number, field: keyof MonthlyExpenses, value: number) => {
    if (field === 'isManual') return;
    setMonthlyExpenses(prev => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = { ...updated[index], [field]: value, isManual: true };
      }
      return updated;
    });
  };

  // Reset expenses to defaults (recalculate from rates)
  const resetExpenses = () => {
    setMonthlyExpenses([]);
    setExpenseRates(DEFAULT_EXPENSE_RATES);
    localStorage.removeItem(EXPENSES_STORAGE_KEY);
    localStorage.removeItem(EXPENSE_RATES_STORAGE_KEY);
  };

  const resetToDefaults = () => {
    setInputs(DEFAULT_INPUTS);
    setPlans(DEFAULT_PLANS);
    setEnterprise(DEFAULT_ENTERPRISE);
    setUserBreakdown([]);
    setMonthlyExpenses([]);
    setExpenseRates(DEFAULT_EXPENSE_RATES);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PLANS_STORAGE_KEY);
    localStorage.removeItem(ENTERPRISE_STORAGE_KEY);
    localStorage.removeItem(USER_BREAKDOWN_STORAGE_KEY);
    localStorage.removeItem(EXPENSES_STORAGE_KEY);
    localStorage.removeItem(EXPENSE_RATES_STORAGE_KEY);
  };

  const resetManualScenario = () => {
    const { monthlyGrowthPct, churnPct } = inputs;
    const netGrowth = (monthlyGrowthPct - churnPct) / 100;
    const reset: MonthlyScenario[] = [];
    let users = totalUsers;
    for (let i = 0; i <= 12; i++) {
      if (i > 0) users = Math.round(users * (1 + netGrowth));
      reset.push({ month: MONTH_LABELS[i], users, isManual: false });
    }
    setManualScenario(reset);
    // Also reset user breakdown
    setUserBreakdown([]);
  };

  const getStatus = (value: number, good: number, warn: number, higher = true): 'good' | 'warn' | 'bad' => {
    if (higher) return value >= good ? 'good' : value >= warn ? 'warn' : 'bad';
    return value <= good ? 'good' : value <= warn ? 'warn' : 'bad';
  };

  const StatusBadge = ({ status }: { status: 'good' | 'warn' | 'bad' }) => (
    <span className={cn(
      'w-1.5 h-1.5 rounded-full',
      status === 'good' && 'bg-emerald-500',
      status === 'warn' && 'bg-amber-500',
      status === 'bad' && 'bg-red-500'
    )} />
  );

  if (actualsLoading) {
    return (
      <AdminLayoutV2>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-5 w-5 animate-spin text-[#666]" />
        </div>
      </AdminLayoutV2>
    );
  }

  return (
    <AdminLayoutV2>
      <div className="space-y-2 max-w-[1600px] mx-auto">
        {/* Header + Current Stats */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-base font-semibold">Unit Economics</h1>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="text-[#888]">Actual:</span>
              <span className="font-medium">{totalUsers} users</span>
              {realPaidUsers > 0 ? (
                <>
                  <span className="text-emerald-600 font-medium">{realPaidUsers} paid</span>
                  <span className="text-emerald-600 font-medium">${realMRR.toFixed(0)} MRR</span>
                </>
              ) : (
                <span className="text-amber-600 text-[9px]">(no payment data)</span>
              )}
              <span className="text-[#666]">|</span>
              <span className="text-[#888]">Model:</span>
              <span className="text-purple-600">{economics.estPaidUsers} paid</span>
              <span className="text-emerald-600">${fmtMoney(economics.subscriptionRevenue)} sub</span>
              {economics.enterpriseRevenue > 0 && (
                <span className="text-orange-600">+${fmtMoney(economics.enterpriseRevenue)} ent</span>
              )}
              <span className="text-emerald-600 font-medium">${fmtMoney(economics.estMRR)} MRR</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={resetToDefaults} className="text-[9px] text-[#888] hover:text-[#666] px-1.5 py-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded" title="Reset to defaults">
              Reset
            </button>
            <button onClick={() => refetch()} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded" title="Refresh data">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Main 3-Column Layout */}
        <div className="grid grid-cols-12 gap-2">
          {/* Left: Inputs (Compact) */}
          <div className="col-span-2 bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-2 space-y-2">
            <div className="text-[10px] font-medium flex items-center gap-1">
              <Target className="h-3 w-3 text-purple-500" /> Inputs
            </div>
            <div className="space-y-1">
              <CompactInput label="Tok/Slide" value={inputs.tokensPerSlide} onChange={v => updateInput('tokensPerSlide', v)} />
              <CompactInput label="Tok/Edit" value={inputs.tokensPerEdit} onChange={v => updateInput('tokensPerEdit', v)} />
              <CompactInput label="Tok/Rsch" value={inputs.tokensPerResearch} onChange={v => updateInput('tokensPerResearch', v)} />
              <CompactInput label="Free Tok" value={inputs.freeTokens} onChange={v => updateInput('freeTokens', v)} />
            </div>
            <div className="border-t border-[#eaeaea] dark:border-[#333] pt-1 space-y-1">
              <CompactInput label="Slides/Dk" value={inputs.slidesPerDeck} onChange={v => updateInput('slidesPerDeck', v)} />
              <CompactInput label="Edits/Dk" value={inputs.editsPerDeck} onChange={v => updateInput('editsPerDeck', v)} />
              <CompactInput label="Rsch/Dk" value={inputs.researchCallsPerDeck} onChange={v => updateInput('researchCallsPerDeck', v)} />
              <CompactInput label="Decks/Mo" value={inputs.decksPerActiveUserMonth} onChange={v => updateInput('decksPerActiveUserMonth', v)} />
            </div>
            <div className="border-t border-[#eaeaea] dark:border-[#333] pt-1 space-y-1">
              <div className="text-[8px] text-[#888] font-medium">Token Consumption %</div>
              <CompactInput label="Free" value={inputs.freeTokenConsumptionPct} onChange={v => updateInput('freeTokenConsumptionPct', v)} step={5} />
              <CompactInput label="Starter" value={inputs.starterTokenConsumptionPct} onChange={v => updateInput('starterTokenConsumptionPct', v)} step={5} />
              <CompactInput label="Pro" value={inputs.proTokenConsumptionPct} onChange={v => updateInput('proTokenConsumptionPct', v)} step={5} />
              <CompactInput label="Enterpr" value={inputs.enterpriseTokenConsumptionPct} onChange={v => updateInput('enterpriseTokenConsumptionPct', v)} step={5} />
            </div>
            <div className="border-t border-[#eaeaea] dark:border-[#333] pt-1 space-y-1">
              <div className="text-[8px] text-[#888] font-medium">Conversion</div>
              <CompactInput label="Direct %" value={inputs.paidConversionPct} onChange={v => updateInput('paidConversionPct', v)} step={0.5} />
              <CompactInput label="Upgr %" value={inputs.freeToPayConvPct} onChange={v => updateInput('freeToPayConvPct', v)} step={1} />
              <div className="text-[8px] text-[#888] pl-1">→ {economics.effectivePaidConversionPct.toFixed(1)}% effective</div>
            </div>
            <div className="border-t border-[#eaeaea] dark:border-[#333] pt-1 space-y-1">
              <div className="text-[8px] text-[#888] font-medium">Growth & Churn</div>
              <CompactInput label="Growth %" value={inputs.monthlyGrowthPct} onChange={v => updateInput('monthlyGrowthPct', v)} />
              <CompactInput label="Churn %" value={inputs.churnPct} onChange={v => updateInput('churnPct', v)} />
              <div className="text-[8px] text-[#666] pl-1">
                <div className="flex justify-between"><span>New/mo:</span><span>+{Math.round(totalUsers * inputs.monthlyGrowthPct / 100)}</span></div>
                <div className="flex justify-between"><span>Lost/mo:</span><span>-{Math.round(totalUsers * inputs.churnPct / 100)}</span></div>
              </div>
            </div>
            <div className="border-t border-[#eaeaea] dark:border-[#333] pt-1 space-y-1">
              <div className="text-[8px] text-[#888] font-medium">Customer Acquisition</div>
              <CompactInput label="CAC $/user" value={inputs.cac} onChange={v => updateInput('cac', v)} />
              <CompactInput label="Paid %" value={inputs.paidAcquisitionPct} onChange={v => updateInput('paidAcquisitionPct', v)} step={5} min={0} max={100} />
              <div className="text-[8px] text-[#666] pl-1">
                <div className="flex justify-between"><span>Paid:</span><span>{Math.round((totalUsers * inputs.monthlyGrowthPct / 100) * inputs.paidAcquisitionPct / 100)} new/mo</span></div>
                <div className="flex justify-between"><span>Organic:</span><span>{Math.round((totalUsers * inputs.monthlyGrowthPct / 100) * (100 - inputs.paidAcquisitionPct) / 100)} new/mo</span></div>
                <div className="flex justify-between text-red-600"><span>Spend:</span><span>${fmtMoney(Math.round((totalUsers * inputs.monthlyGrowthPct / 100) * inputs.paidAcquisitionPct / 100) * inputs.cac)}/mo</span></div>
              </div>
            </div>
            <div className="border-t border-[#eaeaea] dark:border-[#333] pt-1 space-y-1">
              <div className="text-[8px] text-[#888] font-medium">Starter → Pro</div>
              <CompactInput label="Upgr %" value={inputs.starterUpgradePct} onChange={v => updateInput('starterUpgradePct', v)} step={1} />
              <div className="text-[8px] text-[#666]">
                <div className="flex justify-between"><span>Starter:</span><span>{economics.starterUsers} ({starterPct}%)</span></div>
                <div className="flex justify-between"><span>Upgrade:</span><span>{economics.starterUpgradeUsers}</span></div>
                <div className="flex justify-between text-emerald-600"><span>+Rev:</span><span>${fmtMoney(economics.upgradeRevenue || 0)}/mo</span></div>
              </div>
            </div>
            <div className="border-t border-[#eaeaea] dark:border-[#333] pt-1 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-[#888]">Overage (Pro+)</span>
                <input
                  type="checkbox"
                  checked={inputs.overageEnabled}
                  onChange={e => setInputs(prev => ({ ...prev, overageEnabled: e.target.checked }))}
                  className="h-3 w-3"
                />
              </div>
              {inputs.overageEnabled && (
                <>
                  <div className="text-[8px] text-[#666]">Pro+ users: {economics.proPlusUsers} ({proPlusPct}%)</div>
                  <CompactInput label="% go over" value={inputs.overagePctOfProUsers} onChange={v => updateInput('overagePctOfProUsers', v)} step={1} />
                  <CompactInput label="Avg tok" value={inputs.avgOverageTokensPerUser} onChange={v => updateInput('avgOverageTokensPerUser', v)} />
                  <CompactInput label="$/token" value={inputs.overagePricePerToken} onChange={v => updateInput('overagePricePerToken', v)} step={0.01} />
                  <div className="text-[8px] text-[#666] pt-0.5 border-t border-[#eaeaea] dark:border-[#333]">
                    <div className="flex justify-between"><span>Users over:</span><span>{economics.overageUsers}</span></div>
                    <div className="flex justify-between"><span>Tokens:</span><span>{fmtNum(economics.overageTokensTotal || 0)}</span></div>
                    <div className="flex justify-between text-emerald-600"><span>Revenue:</span><span>+${fmtMoney(economics.overageRevenue || 0)}/mo</span></div>
                    <div className="flex justify-between text-red-600"><span>Cost:</span><span>+${fmtMoney(economics.overageCost || 0)}/mo</span></div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Center: Chart + Stats */}
          <div className="col-span-7 space-y-2">
            {/* Chart */}
            <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-2">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-medium">Cumulative {projectionMonths}mo</span>
                  <select value={projectionMonths} onChange={e => { setProjectionMonths(Number(e.target.value)); setSelectedMonth(Number(e.target.value)); }} className="h-5 text-[9px] border border-[#eaeaea] dark:border-[#333] rounded bg-transparent px-1">
                    {[3, 6, 9, 12].map(n => <option key={n} value={n}>{n}mo</option>)}
                  </select>
                </div>
                <Tabs value={chartView} onValueChange={v => setChartView(v as typeof chartView)}>
                  <TabsList className="h-5">
                    <TabsTrigger value="combined" className="text-[9px] px-1.5 h-4">All</TabsTrigger>
                    <TabsTrigger value="users" className="text-[9px] px-1.5 h-4">Users</TabsTrigger>
                    <TabsTrigger value="financials" className="text-[9px] px-1.5 h-4">$$$</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <div className="h-[calc(100vh-380px)] min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={projectionData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }} onClick={(e) => e?.activeTooltipIndex !== undefined && setSelectedMonth(e.activeTooltipIndex)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.1} />
                    <XAxis dataKey="month" tick={{ fontSize: 9 }} tickLine={false} />
                    {(chartView === 'combined' || chartView === 'users') && (
                      <YAxis yAxisId="users" orientation="left" tick={{ fontSize: 9 }} tickLine={false} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                    )}
                    {(chartView === 'combined' || chartView === 'financials') && (
                      <YAxis yAxisId="money" orientation="right" tick={{ fontSize: 9 }} tickLine={false} tickFormatter={v => `$${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
                    )}
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '9px' }} />
                    {(chartView === 'combined' || chartView === 'financials') && (
                      <ReferenceLine y={0} yAxisId="money" stroke="#666" strokeDasharray="3 3" />
                    )}
                    {(chartView === 'combined' || chartView === 'users') && (
                      <ReferenceLine x={MONTH_LABELS[selectedMonth]} yAxisId="users" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="4 4" />
                    )}
                    {chartView === 'financials' && (
                      <ReferenceLine x={MONTH_LABELS[selectedMonth]} yAxisId="money" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="4 4" />
                    )}
                    {(chartView === 'combined' || chartView === 'users') && (
                      <>
                        <Line yAxisId="users" type="monotone" dataKey="users" name="Users" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 2 }} />
                        <Line yAxisId="users" type="monotone" dataKey="paidUsers" name="Paid" stroke="#f59e0b" strokeWidth={1.5} dot={{ r: 1.5 }} strokeDasharray="3 2" />
                      </>
                    )}
                    {(chartView === 'combined' || chartView === 'financials') && (
                      <>
                        <Area yAxisId="money" type="monotone" dataKey="cumRevenue" name="Total Rev" fill="#10b981" fillOpacity={0.15} stroke="#10b981" strokeWidth={2} />
                        <Area yAxisId="money" type="monotone" dataKey="cumCosts" name="Total Cost" fill="#ef4444" fillOpacity={0.1} stroke="#ef4444" strokeWidth={2} />
                        <Line yAxisId="money" type="monotone" dataKey="cumProfit" name="Total Profit" stroke="#3b82f6" strokeWidth={2} dot={false} />
                      </>
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Selected Month Stats */}
            <div className="grid grid-cols-6 gap-1.5">
              <div className="bg-white dark:bg-[#111] border border-purple-500/30 rounded p-1.5 text-center">
                <div className="text-[9px] text-purple-600">M{selectedMonth} Users</div>
                <div className="text-sm font-semibold">{fmtNum(selectedData?.users || 0)}</div>
                <div className="text-[8px] text-[#888]">{fmtNum(selectedData?.paidUsers || 0)} paid</div>
              </div>
              <div className="bg-white dark:bg-[#111] border border-emerald-500/30 rounded p-1.5 text-center">
                <div className="text-[9px] text-emerald-600">Total Revenue</div>
                <div className="text-sm font-semibold text-emerald-600">${fmtMoney(selectedData?.cumRevenue || 0)}</div>
                <div className="text-[8px] text-[#888]">${fmtMoney(selectedData?.revenue || 0)}/mo</div>
              </div>
              <div className="bg-white dark:bg-[#111] border border-red-500/30 rounded p-1.5 text-center">
                <div className="text-[9px] text-red-600">Total Costs</div>
                <div className="text-sm font-semibold text-red-600">${fmtMoney(selectedData?.cumCosts || 0)}</div>
                <div className="text-[8px] text-[#888]">${fmtMoney(selectedData?.costs || 0)}/mo</div>
              </div>
              <div className={cn("bg-white dark:bg-[#111] border rounded p-1.5 text-center", selectedData?.cumProfit >= 0 ? "border-blue-500/30" : "border-red-500/30")}>
                <div className={cn("text-[9px]", selectedData?.cumProfit >= 0 ? "text-blue-600" : "text-red-600")}>Total Profit</div>
                <div className={cn("text-sm font-semibold", selectedData?.cumProfit >= 0 ? "text-blue-600" : "text-red-600")}>${fmtMoney(selectedData?.cumProfit || 0)}</div>
                <div className="text-[8px] text-[#888]">${fmtMoney(selectedData?.profit || 0)}/mo</div>
              </div>
              <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded p-1.5 text-center">
                <div className="text-[9px] text-[#888]">Margin</div>
                <div className="text-sm font-semibold">{selectedData && selectedData.cumRevenue > 0 ? ((selectedData.cumProfit / selectedData.cumRevenue) * 100).toFixed(0) : 0}%</div>
                <div className="text-[8px] text-[#888]">gross</div>
              </div>
              <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded p-1.5 text-center">
                <div className="text-[9px] text-[#888]">Cost/Deck</div>
                <div className="text-sm font-semibold">${economics.costPerDeck.toFixed(2)}</div>
                <div className="text-[8px] text-[#888]">{economics.tokensPerDeck} tok</div>
              </div>
            </div>

            {/* Breakdown Tabs - Users | Expenses */}
            <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-2">
              {/* Tab Header */}
              <div className="flex items-center justify-between mb-2">
                <Tabs value={breakdownTab} onValueChange={v => setBreakdownTab(v as 'users' | 'expenses')}>
                  <TabsList className="h-6">
                    <TabsTrigger value="users" className="text-[9px] px-2 h-5 gap-1">
                      <Users className="h-3 w-3" /> Users
                    </TabsTrigger>
                    <TabsTrigger value="expenses" className="text-[9px] px-2 h-5 gap-1">
                      <Building2 className="h-3 w-3" /> Expenses
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                {breakdownTab === 'expenses' && monthlyExpenses.some(e => e?.isManual) && (
                  <button onClick={resetExpenses} className="text-[8px] text-[#888] hover:text-[#666] flex items-center gap-1">
                    <RotateCcw className="h-2.5 w-2.5" /> Reset
                  </button>
                )}
              </div>

              <div className="space-y-0.5">
                {/* Header Row with Month Labels */}
                <div className="flex items-center gap-2">
                  <div className="w-14 flex-shrink-0" />
                  <div className="flex items-center gap-1 flex-1">
                    {manualScenario.slice(0, projectionMonths + 1).map((item, i) => (
                      <div key={`hdr-${i}`} className="flex-1 text-center">
                        <div className={cn("text-[8px]", i === selectedMonth ? "text-purple-600 font-medium" : "text-[#888]")}>{item.month}</div>
                      </div>
                    ))}
                  </div>
                  <div className="w-5" />
                </div>

                {/* Users Tab Content */}
                {breakdownTab === 'users' && (
                  <>
                    {/* Total Users Row */}
                    <div className="flex items-center gap-2">
                      <div className="w-14 flex-shrink-0 flex items-center gap-1">
                        <Users className="h-3 w-3 text-purple-500" />
                        <span className="text-[9px] font-medium">Total</span>
                      </div>
                      <div className="flex items-center gap-1 flex-1">
                        {manualScenario.slice(0, projectionMonths + 1).map((item, i) => (
                          <div key={`total-${i}`} className="flex-1">
                            <Input
                              type="number"
                              value={item.users}
                              onChange={e => updateManualUsers(i, Number(e.target.value))}
                              onClick={() => setSelectedMonth(i)}
                              className={cn(
                                "h-5 text-[9px] text-center px-0.5",
                                item.isManual && "border-purple-500 bg-purple-500/5",
                                i === selectedMonth && "ring-1 ring-purple-500"
                              )}
                            />
                          </div>
                        ))}
                      </div>
                      {(manualScenario.some(s => s.isManual) || userBreakdown.some(b => b?.isManual)) && (
                        <button onClick={resetManualScenario} className="w-5 text-[#888] hover:text-[#666]" title="Reset">
                          <RotateCcw className="h-3 w-3" />
                        </button>
                      )}
                    </div>

                    {/* Free Users Row */}
                    <div className="flex items-center gap-2">
                      <div className="w-14 flex-shrink-0">
                        <span className="text-[9px] text-[#888]">Free</span>
                      </div>
                      <div className="flex items-center gap-1 flex-1">
                        {userBreakdown.slice(0, projectionMonths + 1).map((item, i) => (
                          <div key={`free-${i}`} className="flex-1">
                            <Input
                              type="number"
                              value={item?.free || 0}
                              onChange={e => updateUserBreakdown(i, 'free', Number(e.target.value))}
                              onClick={() => setSelectedMonth(i)}
                              className={cn(
                                "h-5 text-[9px] text-center px-0.5 text-[#888]",
                                item?.isManual && "border-blue-500 bg-blue-500/5",
                                i === selectedMonth && "ring-1 ring-purple-500"
                              )}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="w-5" />
                    </div>

                    {/* Divider - PAID */}
                    <div className="flex items-center gap-2 py-0.5">
                      <div className="w-14 flex-shrink-0">
                        <span className="text-[8px] text-amber-600 font-medium">PAID</span>
                      </div>
                      <div className="flex-1 h-px bg-amber-500/30" />
                      <div className="w-5" />
                    </div>

                    {/* Starter Row */}
                    <div className="flex items-center gap-2">
                      <div className="w-14 flex-shrink-0">
                        <span className="text-[9px] text-amber-600">Starter</span>
                      </div>
                      <div className="flex items-center gap-1 flex-1">
                        {userBreakdown.slice(0, projectionMonths + 1).map((item, i) => (
                          <div key={`starter-${i}`} className="flex-1">
                            <Input
                              type="number"
                              value={item?.starter || 0}
                              onChange={e => updateUserBreakdown(i, 'starter', Number(e.target.value))}
                              onClick={() => setSelectedMonth(i)}
                              className={cn(
                                "h-5 text-[9px] text-center px-0.5",
                                item?.isManual && "border-blue-500 bg-blue-500/5",
                                i === selectedMonth && "ring-1 ring-purple-500"
                              )}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="w-5" />
                    </div>

                    {/* Pro Row */}
                    <div className="flex items-center gap-2">
                      <div className="w-14 flex-shrink-0">
                        <span className="text-[9px] text-blue-600">Pro</span>
                      </div>
                      <div className="flex items-center gap-1 flex-1">
                        {userBreakdown.slice(0, projectionMonths + 1).map((item, i) => (
                          <div key={`pro-${i}`} className="flex-1">
                            <Input
                              type="number"
                              value={item?.pro || 0}
                              onChange={e => updateUserBreakdown(i, 'pro', Number(e.target.value))}
                              onClick={() => setSelectedMonth(i)}
                              className={cn(
                                "h-5 text-[9px] text-center px-0.5",
                                item?.isManual && "border-blue-500 bg-blue-500/5",
                                i === selectedMonth && "ring-1 ring-purple-500"
                              )}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="w-5" />
                    </div>

                    {/* Team Row */}
                    <div className="flex items-center gap-2">
                      <div className="w-14 flex-shrink-0">
                        <span className="text-[9px] text-emerald-600">Team</span>
                      </div>
                      <div className="flex items-center gap-1 flex-1">
                        {userBreakdown.slice(0, projectionMonths + 1).map((item, i) => (
                          <div key={`team-${i}`} className="flex-1">
                            <Input
                              type="number"
                              value={item?.team || 0}
                              onChange={e => updateUserBreakdown(i, 'team', Number(e.target.value))}
                              onClick={() => setSelectedMonth(i)}
                              className={cn(
                                "h-5 text-[9px] text-center px-0.5",
                                item?.isManual && "border-blue-500 bg-blue-500/5",
                                i === selectedMonth && "ring-1 ring-purple-500"
                              )}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="w-5" />
                    </div>

                    {/* Total Paid Row (calculated) - Subscription users only */}
                    <div className="flex items-center gap-2 pt-1 border-t border-[#eaeaea] dark:border-[#333]">
                      <div className="w-14 flex-shrink-0">
                        <span className="text-[9px] text-amber-600 font-medium">Σ Paid</span>
                      </div>
                      <div className="flex items-center gap-1 flex-1">
                        {userBreakdown.slice(0, projectionMonths + 1).map((item, i) => {
                          const totalPaid = (item?.starter || 0) + (item?.pro || 0) + (item?.team || 0);
                          return (
                            <div key={`sum-${i}`} className="flex-1">
                              <div className={cn(
                                "h-5 flex items-center justify-center text-[9px] rounded border font-medium",
                                i === selectedMonth ? "border-amber-500 bg-amber-500/10 text-amber-600" : "border-[#eaeaea] dark:border-[#333] text-amber-600/70"
                              )}>
                                {fmtNum(totalPaid)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="w-5" />
                    </div>

                    {/* Enterprise Deals Section */}
                    <div className="flex items-center gap-2 pt-1 border-t border-[#eaeaea] dark:border-[#333]">
                      <div className="w-14 flex-shrink-0">
                        <span className="text-[8px] text-orange-600 font-medium">ENTERPRISE</span>
                      </div>
                      <div className="flex-1 flex items-center gap-2 text-[8px] text-[#666]">
                        <span>Deals/yr:</span>
                        <Input
                          type="number"
                          value={enterprise.dealsPerYear}
                          onChange={e => updateEnterprise('dealsPerYear', Number(e.target.value))}
                          className="h-4 w-10 text-[9px] text-center px-0.5"
                        />
                        <span>×</span>
                        <span>$</span>
                        <Input
                          type="number"
                          value={enterprise.avgDealSize}
                          onChange={e => updateEnterprise('avgDealSize', Number(e.target.value))}
                          className="h-4 w-16 text-[9px] text-center px-0.5"
                        />
                        <span className="text-orange-600 font-medium">= ${fmtMoney(enterprise.dealsPerYear * enterprise.avgDealSize)}/yr</span>
                      </div>
                      <div className="w-5" />
                    </div>

                    {/* Enterprise Deals Row */}
                    <div className="flex items-center gap-2">
                      <div className="w-14 flex-shrink-0">
                        <span className="text-[9px] text-orange-600">Deals</span>
                      </div>
                      <div className="flex items-center gap-1 flex-1">
                        {userBreakdown.slice(0, projectionMonths + 1).map((item, i) => (
                          <div key={`ent-${i}`} className="flex-1">
                            <Input
                              type="number"
                              value={item?.enterprise || 0}
                              onChange={e => updateUserBreakdown(i, 'enterprise', Number(e.target.value))}
                              onClick={() => setSelectedMonth(i)}
                              className={cn(
                                "h-5 text-[9px] text-center px-0.5",
                                item?.isManual && "border-blue-500 bg-blue-500/5",
                                i === selectedMonth && "ring-1 ring-purple-500"
                              )}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="w-5" />
                    </div>

                    {/* One-off Costs Row (setup fees, custom work, etc.) */}
                    <div className="flex items-center gap-2">
                      <div className="w-14 flex-shrink-0">
                        <span className="text-[9px] text-red-500">Costs $</span>
                      </div>
                      <div className="flex items-center gap-1 flex-1">
                        {userBreakdown.slice(0, projectionMonths + 1).map((item, i) => (
                          <div key={`oneoff-${i}`} className="flex-1">
                            <Input
                              type="number"
                              value={item?.oneOffSpend || 0}
                              onChange={e => updateUserBreakdown(i, 'oneOffSpend', Number(e.target.value))}
                              onClick={() => setSelectedMonth(i)}
                              className={cn(
                                "h-5 text-[9px] text-center px-0.5",
                                item?.isManual && "border-blue-500 bg-blue-500/5",
                                i === selectedMonth && "ring-1 ring-purple-500"
                              )}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="w-5" />
                    </div>
                  </>
                )}

                {/* Expenses Tab Content */}
                {breakdownTab === 'expenses' && (
                  <>
                    {/* Expense Defaults Header */}
                    <div className="flex items-center gap-2 pb-1 mb-1 border-b border-[#eaeaea] dark:border-[#333]">
                      <div className="w-14 flex-shrink-0">
                        <span className="text-[8px] text-[#888] font-medium">DEFAULTS</span>
                      </div>
                      <div className="flex-1 flex items-center gap-3 text-[8px] text-[#666]">
                        <span>Headcount:</span>
                        <Input type="number" value={expenseRates.headcount} onChange={e => updateExpenseRate('headcount', Number(e.target.value))} className="h-4 w-8 text-[9px] text-center px-0.5" />
                        <span>× $</span>
                        <Input type="number" value={expenseRates.avgSalary} onChange={e => updateExpenseRate('avgSalary', Number(e.target.value))} className="h-4 w-14 text-[9px] text-center px-0.5" />
                        <span>/mo</span>
                        <span className="text-[#888]">|</span>
                        <span>Stripe:</span>
                        <Input type="number" value={expenseRates.stripePct} onChange={e => updateExpenseRate('stripePct', Number(e.target.value))} className="h-4 w-10 text-[9px] text-center px-0.5" step={0.1} />
                        <span>%</span>
                      </div>
                      <div className="w-5" />
                    </div>

                    {/* Headcount Section */}
                    <div className="flex items-center gap-2 py-0.5">
                      <div className="w-14 flex-shrink-0">
                        <span className="text-[8px] text-blue-600 font-medium">TEAM</span>
                      </div>
                      <div className="flex-1 h-px bg-blue-500/30" />
                      <div className="w-5" />
                    </div>

                    {/* Headcount Row */}
                    <div className="flex items-center gap-2">
                      <div className="w-14 flex-shrink-0">
                        <span className="text-[9px] text-blue-600">Headcount</span>
                      </div>
                      <div className="flex items-center gap-1 flex-1">
                        {monthlyExpenses.slice(0, projectionMonths + 1).map((item, i) => (
                          <div key={`hc-${i}`} className="flex-1">
                            <Input
                              type="number"
                              value={item?.headcount || expenseRates.headcount}
                              onChange={e => updateMonthlyExpense(i, 'headcount', Number(e.target.value))}
                              onClick={() => setSelectedMonth(i)}
                              className={cn(
                                "h-5 text-[9px] text-center px-0.5",
                                item?.isManual && "border-blue-500 bg-blue-500/5",
                                i === selectedMonth && "ring-1 ring-purple-500"
                              )}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="w-5" />
                    </div>

                    {/* Salary Row */}
                    <div className="flex items-center gap-2">
                      <div className="w-14 flex-shrink-0">
                        <span className="text-[9px] text-blue-500">Salary/mo</span>
                      </div>
                      <div className="flex items-center gap-1 flex-1">
                        {monthlyExpenses.slice(0, projectionMonths + 1).map((item, i) => (
                          <div key={`sal-${i}`} className="flex-1">
                            <Input
                              type="number"
                              value={item?.avgSalary || expenseRates.avgSalary}
                              onChange={e => updateMonthlyExpense(i, 'avgSalary', Number(e.target.value))}
                              onClick={() => setSelectedMonth(i)}
                              className={cn(
                                "h-5 text-[9px] text-center px-0.5",
                                item?.isManual && "border-blue-500 bg-blue-500/5",
                                i === selectedMonth && "ring-1 ring-purple-500"
                              )}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="w-5" />
                    </div>

                    {/* Infrastructure Section */}
                    <div className="flex items-center gap-2 py-0.5">
                      <div className="w-14 flex-shrink-0">
                        <span className="text-[8px] text-emerald-600 font-medium">INFRA</span>
                      </div>
                      <div className="flex-1 h-px bg-emerald-500/30" />
                      <div className="w-5" />
                    </div>

                    {/* Render Row */}
                    <div className="flex items-center gap-2">
                      <div className="w-14 flex-shrink-0">
                        <span className="text-[9px] text-emerald-600">Render</span>
                      </div>
                      <div className="flex items-center gap-1 flex-1">
                        {monthlyExpenses.slice(0, projectionMonths + 1).map((item, i) => (
                          <div key={`render-${i}`} className="flex-1">
                            <Input
                              type="number"
                              value={item?.render || expenseRates.render}
                              onChange={e => updateMonthlyExpense(i, 'render', Number(e.target.value))}
                              onClick={() => setSelectedMonth(i)}
                              className={cn(
                                "h-5 text-[9px] text-center px-0.5",
                                item?.isManual && "border-blue-500 bg-blue-500/5",
                                i === selectedMonth && "ring-1 ring-purple-500"
                              )}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="w-5" />
                    </div>

                    {/* Supabase Row */}
                    <div className="flex items-center gap-2">
                      <div className="w-14 flex-shrink-0">
                        <span className="text-[9px] text-emerald-500">Supabase</span>
                      </div>
                      <div className="flex items-center gap-1 flex-1">
                        {monthlyExpenses.slice(0, projectionMonths + 1).map((item, i) => (
                          <div key={`supa-${i}`} className="flex-1">
                            <Input
                              type="number"
                              value={item?.supabase || expenseRates.supabase}
                              onChange={e => updateMonthlyExpense(i, 'supabase', Number(e.target.value))}
                              onClick={() => setSelectedMonth(i)}
                              className={cn(
                                "h-5 text-[9px] text-center px-0.5",
                                item?.isManual && "border-blue-500 bg-blue-500/5",
                                i === selectedMonth && "ring-1 ring-purple-500"
                              )}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="w-5" />
                    </div>

                    {/* APIs Section */}
                    <div className="flex items-center gap-2 py-0.5">
                      <div className="w-14 flex-shrink-0">
                        <span className="text-[8px] text-amber-600 font-medium">SERVICES</span>
                      </div>
                      <div className="flex-1 h-px bg-amber-500/30" />
                      <div className="w-5" />
                    </div>

                    {/* SerpAPI Row */}
                    <div className="flex items-center gap-2">
                      <div className="w-14 flex-shrink-0">
                        <span className="text-[9px] text-amber-600">SerpAPI</span>
                      </div>
                      <div className="flex items-center gap-1 flex-1">
                        {monthlyExpenses.slice(0, projectionMonths + 1).map((item, i) => (
                          <div key={`serp-${i}`} className="flex-1">
                            <Input
                              type="number"
                              value={item?.serpapi || expenseRates.serpapi}
                              onChange={e => updateMonthlyExpense(i, 'serpapi', Number(e.target.value))}
                              onClick={() => setSelectedMonth(i)}
                              className={cn(
                                "h-5 text-[9px] text-center px-0.5",
                                item?.isManual && "border-blue-500 bg-blue-500/5",
                                i === selectedMonth && "ring-1 ring-purple-500"
                              )}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="w-5" />
                    </div>

                    {/* Stripe Row (calculated from revenue) */}
                    <div className="flex items-center gap-2">
                      <div className="w-14 flex-shrink-0">
                        <span className="text-[9px] text-amber-500">Stripe</span>
                      </div>
                      <div className="flex items-center gap-1 flex-1">
                        {projectionData.slice(0, projectionMonths + 1).map((data, i) => {
                          const stripeFee = data?.stripeFees || (data?.revenue || 0) * (expenseRates.stripePct / 100);
                          return (
                            <div key={`stripe-${i}`} className="flex-1">
                              <div className={cn(
                                "h-5 flex items-center justify-center text-[9px] rounded border text-[#888]",
                                i === selectedMonth ? "border-amber-500/50 bg-amber-500/5" : "border-[#eaeaea] dark:border-[#333]"
                              )}>
                                {fmtNum(stripeFee, 0)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="w-5" />
                    </div>

                    {/* Other Row */}
                    <div className="flex items-center gap-2">
                      <div className="w-14 flex-shrink-0">
                        <span className="text-[9px] text-[#888]">Other</span>
                      </div>
                      <div className="flex items-center gap-1 flex-1">
                        {monthlyExpenses.slice(0, projectionMonths + 1).map((item, i) => (
                          <div key={`other-${i}`} className="flex-1">
                            <Input
                              type="number"
                              value={item?.other || expenseRates.other}
                              onChange={e => updateMonthlyExpense(i, 'other', Number(e.target.value))}
                              onClick={() => setSelectedMonth(i)}
                              className={cn(
                                "h-5 text-[9px] text-center px-0.5",
                                item?.isManual && "border-blue-500 bg-blue-500/5",
                                i === selectedMonth && "ring-1 ring-purple-500"
                              )}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="w-5" />
                    </div>

                    {/* Total Operating Expenses Row */}
                    <div className="flex items-center gap-2 pt-1 border-t border-[#eaeaea] dark:border-[#333]">
                      <div className="w-14 flex-shrink-0">
                        <span className="text-[9px] text-red-600 font-medium">Σ OpEx</span>
                      </div>
                      <div className="flex items-center gap-1 flex-1">
                        {projectionData.slice(0, projectionMonths + 1).map((data, i) => {
                          const exp = monthlyExpenses[i] || { headcount: expenseRates.headcount, avgSalary: expenseRates.avgSalary, render: expenseRates.render, supabase: expenseRates.supabase, serpapi: expenseRates.serpapi, other: expenseRates.other };
                          const headcountCost = exp.headcount * exp.avgSalary;
                          const infra = exp.render + exp.supabase;
                          const services = exp.serpapi + exp.other;
                          const stripe = data?.stripeFees || 0;
                          const totalOpEx = headcountCost + infra + services + stripe;
                          return (
                            <div key={`opex-${i}`} className="flex-1">
                              <div className={cn(
                                "h-5 flex items-center justify-center text-[9px] rounded border font-medium",
                                i === selectedMonth ? "border-red-500 bg-red-500/10 text-red-600" : "border-[#eaeaea] dark:border-[#333] text-red-600/70"
                              )}>
                                ${fmtNum(totalOpEx, 0)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="w-5" />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right: Plans + Metrics */}
          <div className="col-span-3 space-y-2">
            {/* Plans with more detail */}
            <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-2">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1">
                  <CreditCard className="h-3 w-3 text-emerald-500" />
                  <span className="text-[10px] font-medium">Pricing Plans</span>
                </div>
                <span className="text-[9px] text-emerald-600 font-medium">ARPU ${blendedARPU.toFixed(2)}</span>
              </div>
              <div className="space-y-2">
                {plans.map((plan, i) => {
                  const decksPerMonth = Math.floor(plan.tokens / economics.tokensPerDeck);
                  const costPerDeckForPlan = plan.price / Math.max(1, decksPerMonth);
                  return (
                    <div key={plan.name} className="border border-[#eaeaea] dark:border-[#333] rounded p-1.5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Input value={plan.name} onChange={e => updatePlan(i, 'name', e.target.value)} className="h-5 w-14 text-[10px] px-1 font-medium" />
                        <div className="flex items-center">
                          <span className="text-[9px] text-[#888]">$</span>
                          <Input type="number" value={plan.price} onChange={e => updatePlan(i, 'price', Number(e.target.value))} className="h-5 w-14 text-[10px] px-1 text-right" />
                        </div>
                        <Input type="number" value={plan.tokens} onChange={e => updatePlan(i, 'tokens', Number(e.target.value))} className="h-5 w-16 text-[10px] px-1 text-right" />
                        <span className="text-[9px] text-[#888]">t</span>
                        <Input type="number" value={plan.pctOfPaid} onChange={e => updatePlan(i, 'pctOfPaid', Number(e.target.value))} className="h-5 w-12 text-[10px] px-1 text-center" />
                        <span className="text-[9px] text-[#888]">%</span>
                      </div>
                      <div className="flex items-center justify-between text-[8px] text-[#888]">
                        <span>{decksPerMonth} dk/mo</span>
                        <span>${costPerDeckForPlan.toFixed(2)}/dk</span>
                        <span>{inputs.slidesPerDeck} slides</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* API Costs (Editable) */}
            <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-2">
              <div className="text-[10px] font-medium mb-1.5 flex items-center gap-1">
                <DollarSign className="h-3 w-3 text-red-500" />
                API Costs (per op)
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[9px]">
                  <span className="text-[#888]">Slide Gen</span>
                  <div className="flex items-center">
                    <span className="text-[#888]">$</span>
                    <Input type="number" value={inputs.apiCostPerSlide} onChange={e => updateInput('apiCostPerSlide', Number(e.target.value))} className="h-4 w-16 text-[9px] px-1" step={0.001} />
                  </div>
                </div>
                <div className="flex items-center justify-between text-[9px]">
                  <span className="text-[#888]">Edit</span>
                  <div className="flex items-center">
                    <span className="text-[#888]">$</span>
                    <Input type="number" value={inputs.apiCostPerEdit} onChange={e => updateInput('apiCostPerEdit', Number(e.target.value))} className="h-4 w-16 text-[9px] px-1" step={0.001} />
                  </div>
                </div>
                <div className="flex items-center justify-between text-[9px]">
                  <span className="text-[#888]">Research</span>
                  <div className="flex items-center">
                    <span className="text-[#888]">$</span>
                    <Input type="number" value={inputs.apiCostPerResearch} onChange={e => updateInput('apiCostPerResearch', Number(e.target.value))} className="h-4 w-16 text-[9px] px-1" step={0.001} />
                  </div>
                </div>
                <div className="flex items-center justify-between text-[9px]">
                  <span className="text-[#888]">Theme</span>
                  <div className="flex items-center">
                    <span className="text-[#888]">$</span>
                    <Input type="number" value={inputs.apiCostPerTheme} onChange={e => updateInput('apiCostPerTheme', Number(e.target.value))} className="h-4 w-16 text-[9px] px-1" step={0.001} />
                  </div>
                </div>
                <div className="pt-1 border-t border-[#eaeaea] dark:border-[#333] flex justify-between text-[9px]">
                  <span className="font-medium">Total/Deck</span>
                  <span className="font-medium text-red-600">${costPerDeck.toFixed(4)}</span>
                </div>
              </div>
            </div>

            {/* Annual Metrics */}
            <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-2">
              <div className="text-[10px] font-medium mb-1.5">Annual @ M{selectedMonth}</div>
              <div className="space-y-1 text-[10px]">
                <div className="flex justify-between">
                  <span className="text-[#888]">ARR</span>
                  <span className="font-semibold text-emerald-600">${fmtMoney(annualMetrics.arr)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#888]">Annual Costs</span>
                  <span className="font-semibold text-red-600">${fmtMoney(annualMetrics.annualCosts)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#888]">Annual Profit</span>
                  <span className={cn("font-semibold", annualMetrics.annualProfit >= 0 ? "text-blue-600" : "text-red-600")}>
                    ${fmtMoney(annualMetrics.annualProfit)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#888]">Gross Margin</span>
                  <span className={cn("font-semibold", annualMetrics.annualGrossMargin >= 70 ? "text-emerald-600" : annualMetrics.annualGrossMargin >= 50 ? "text-amber-600" : "text-red-600")}>
                    {annualMetrics.annualGrossMargin.toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Key Metrics */}
            <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-2">
              <div className="text-[10px] font-medium mb-1.5">Monthly Metrics</div>
              <div className="space-y-0.5 text-[9px]">
                <MetricRow label="Cost/Paid User" value={`$${economics.costPerPaidUser.toFixed(2)}`} status={getStatus(economics.costPerPaidUser, 5, 10, false)} />
                <MetricRow label="LTV" value={`$${economics.ltv.toFixed(0)}`} sub={`${economics.ltvCac.toFixed(1)}x CAC`} status={getStatus(economics.ltvCac, 3, 1)} />
                <MetricRow label="Payback" value={economics.paybackMonths < 99 ? `${economics.paybackMonths.toFixed(1)}mo` : 'N/A'} status={getStatus(economics.paybackMonths, 6, 12, false)} />
                <MetricRow label="Break-even" value={`${economics.breakEvenPaidUsers} paid`} status={economics.estPaidUsers >= economics.breakEvenPaidUsers ? 'good' : 'warn'} />
                <MetricRow label="Free Trial" value={`${economics.freeDecksOneTime.toFixed(1)} decks`} status={economics.freeDecksOneTime > 0 ? 'good' : 'warn'} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayoutV2>
  );
};

// Compact input for sidebar
const CompactInput = ({ label, value, onChange, step = 1 }: {
  label: string; value: number; onChange: (v: number) => void; step?: number;
}) => (
  <div className="flex items-center justify-between">
    <span className="text-[9px] text-[#888]">{label}</span>
    <Input type="number" value={value} onChange={e => onChange(Number(e.target.value))} step={step} className="h-5 w-16 text-[10px] text-right px-1" />
  </div>
);

// Metric row for sidebar
const MetricRow = ({ label, value, sub, status }: {
  label: string; value: string; sub?: string; status: 'good' | 'warn' | 'bad';
}) => (
  <div className="flex items-center justify-between py-0.5">
    <div className="flex items-center gap-1">
      <span className={cn('w-1.5 h-1.5 rounded-full', status === 'good' && 'bg-emerald-500', status === 'warn' && 'bg-amber-500', status === 'bad' && 'bg-red-500')} />
      <span className="text-[#888]">{label}</span>
    </div>
    <div className="text-right">
      <span className="font-medium">{value}</span>
      {sub && <span className="text-[9px] text-[#666] ml-1">{sub}</span>}
    </div>
  </div>
);

// Custom tooltip for chart
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  return (
    <div className="bg-white dark:bg-[#1a1a1a] border border-[#eaeaea] dark:border-[#333] rounded p-2 text-[10px] shadow-lg">
      <div className="font-medium mb-1 text-black dark:text-white">{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span style={{ color: p.color }}>{p.name}:</span>
          <span className="font-medium text-black dark:text-white">
            {p.name.includes('User') || p.name === 'Paid' ? fmtNum(p.value) : `$${fmtMoney(p.value)}`}
          </span>
        </div>
      ))}
    </div>
  );
};

export default AdminCosts;
