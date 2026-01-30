/**
 * Unit Economics Model Calculations
 *
 * This module contains all pure calculation functions for the cost model.
 * These are extracted from AdminCosts.tsx to enable unit testing.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ModelCosts {
  input: number;  // Cost per 1M input tokens
  output: number; // Cost per 1M output tokens
  name: string;
}

export interface OperationTokens {
  input: number;
  output: number;
  model: string;
}

export interface PlanConfig {
  name: string;
  price: number;
  tokens: number;
  pctOfPaid: number;
  isEnterprise?: boolean;
}

export interface EconomicsInputs {
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
  freeToPayConvPct: number;
  // Growth
  paidConversionPct: number;
  monthlyGrowthPct: number;
  churnPct: number;
  cac: number;
  paidAcquisitionPct: number; // % of signups from paid channels (rest is organic)
  // Token consumption rates
  freeTokenConsumptionPct: number;
  starterTokenConsumptionPct: number;
  proTokenConsumptionPct: number;
  enterpriseTokenConsumptionPct: number;
  // Overage
  overageEnabled: boolean;
  overagePctOfProUsers: number;
  overagePricePerToken: number;
  avgOverageTokensPerUser: number;
  // Starter upgrade
  starterUpgradePct: number;
}

export interface MonthlyUserBreakdown {
  free: number;
  starter: number;
  pro: number;
  team: number;
  enterprise: number;
  oneOffSpend: number;
  isManual: boolean;
}

export interface EnterpriseConfig {
  dealsPerYear: number;
  avgDealSize: number;
  dealMonths: number[];
}

export interface EconomicsResult {
  costPerDeck: number;
  tokensPerDeck: number;
  freeDecksOneTime: number;
  paidDecksPerUserMonth: number;
  totalCost: number;
  estPaidUsers: number;
  freeUsers: number;
  estMRR: number;
  subscriptionRevenue: number;
  overageRevenue: number;
  overageCost: number;
  enterpriseRevenue: number;
  enterpriseDeals: number;
  grossMargin: number;
  ltv: number;
  ltvCac: number;
  effectivePaidConversionPct: number;
  breakEvenPaidUsers: number;
  paybackMonths: number;
  netMonthly: number;
  costPerPaidUser: number;
  profitPerPaidUser: number;
  blendedARPU: number;
  freeTrialCostMonthly: number;
  newFreeTrialUsers: number;
  starterUsers: number;
  proPlusUsers: number;
  activeProPlusUsers: number;
  overageUsers: number;
  overageTokensTotal: number;
  upgradeRevenue: number;
  starterUpgradeUsers: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const MODEL_COSTS: Record<string, ModelCosts> = {
  gemini: { input: 1.25, output: 10.00, name: 'Gemini 3 Pro' },
  perplexity: { input: 1.00, output: 5.00, name: 'Perplexity Sonar Pro' },
  haiku: { input: 0.80, output: 4.00, name: 'Claude Haiku' },
};

export const OP_TOKENS: Record<string, OperationTokens> = {
  slideGen: { input: 850, output: 7700, model: 'gemini' },
  themeGen: { input: 500, output: 2000, model: 'gemini' },
  research: { input: 500, output: 2500, model: 'perplexity' },
  edit: { input: 1500, output: 6500, model: 'gemini' },
  routing: { input: 500, output: 300, model: 'haiku' },
};

export const DEFAULT_PLANS: PlanConfig[] = [
  { name: 'Starter', price: 12, tokens: 500, pctOfPaid: 70 },
  { name: 'Pro', price: 24, tokens: 1500, pctOfPaid: 25 },
  { name: 'Team', price: 49, tokens: 5000, pctOfPaid: 5 },
];

export const DEFAULT_INPUTS: EconomicsInputs = {
  tokensPerSlide: 5,
  tokensPerEdit: 5,
  tokensPerResearch: 5,
  apiCostPerSlide: 0.045,
  apiCostPerEdit: 0.03,
  apiCostPerResearch: 0.005,
  apiCostPerTheme: 0.005,
  slidesPerDeck: 10,
  editsPerDeck: 2,
  researchCallsPerDeck: 1,
  decksPerActiveUserMonth: 3,
  freeTokens: 50,
  freeToPayConvPct: 10,
  paidConversionPct: 2,
  monthlyGrowthPct: 10,
  churnPct: 5,
  cac: 10,
  paidAcquisitionPct: 20, // Only 20% from paid channels
  freeTokenConsumptionPct: 80,
  starterTokenConsumptionPct: 60,
  proTokenConsumptionPct: 75,
  enterpriseTokenConsumptionPct: 50,
  overageEnabled: false,
  overagePctOfProUsers: 20,
  overagePricePerToken: 0.10,
  avgOverageTokensPerUser: 50,
  starterUpgradePct: 15,
};

// ============================================================================
// CALCULATION FUNCTIONS
// ============================================================================

/**
 * Calculate cost per operation based on token usage and model pricing
 */
export function calcOpCost(
  operation: keyof typeof OP_TOKENS,
  modelCosts: Record<string, ModelCosts> = MODEL_COSTS,
  opTokens: Record<string, OperationTokens> = OP_TOKENS
): number {
  const { input, output, model } = opTokens[operation];
  const pricing = modelCosts[model];
  if (!pricing) return 0;
  return (input * pricing.input + output * pricing.output) / 1_000_000;
}

/**
 * Get all pre-calculated operation costs
 */
export function getOperationCosts(
  modelCosts: Record<string, ModelCosts> = MODEL_COSTS,
  opTokens: Record<string, OperationTokens> = OP_TOKENS
): Record<string, number> {
  return {
    slideGen: calcOpCost('slideGen', modelCosts, opTokens),
    themeGen: calcOpCost('themeGen', modelCosts, opTokens),
    research: calcOpCost('research', modelCosts, opTokens),
    edit: calcOpCost('edit', modelCosts, opTokens),
    routing: calcOpCost('routing', modelCosts, opTokens),
  };
}

/**
 * Calculate tokens consumed per deck
 */
export function calcTokensPerDeck(inputs: EconomicsInputs): number {
  const { tokensPerSlide, tokensPerEdit, tokensPerResearch, slidesPerDeck, editsPerDeck, researchCallsPerDeck } = inputs;
  return (slidesPerDeck * tokensPerSlide) + (editsPerDeck * tokensPerEdit) + (researchCallsPerDeck * tokensPerResearch);
}

/**
 * Calculate API cost per deck
 */
export function calcCostPerDeck(inputs: EconomicsInputs, routingCost: number): number {
  const { slidesPerDeck, editsPerDeck, researchCallsPerDeck, apiCostPerSlide, apiCostPerEdit, apiCostPerResearch, apiCostPerTheme } = inputs;
  return (
    apiCostPerTheme +
    (slidesPerDeck * apiCostPerSlide) +
    (researchCallsPerDeck * apiCostPerResearch) +
    (editsPerDeck * apiCostPerEdit) +
    (3 * routingCost) // 3 routing calls per deck (orchestrator routing, validation, context building)
  );
}

/**
 * Calculate blended ARPU from plans
 */
export function calcBlendedARPU(plans: PlanConfig[]): number {
  return plans.reduce((sum, p) => sum + (p.price * p.pctOfPaid / 100), 0);
}

/**
 * Calculate blended tokens per paid user
 */
export function calcBlendedTokensPerPaidUser(plans: PlanConfig[]): number {
  return plans.reduce((sum, p) => sum + (p.tokens * p.pctOfPaid / 100), 0);
}

/**
 * Calculate blended decks per paid user (at 100% token usage)
 */
export function calcBlendedDecksPerPaidUser(plans: PlanConfig[], tokensPerDeck: number): number {
  if (tokensPerDeck === 0) return 0;
  return plans.reduce((sum, p) => {
    const decksForPlan = Math.floor(p.tokens / tokensPerDeck);
    return sum + (decksForPlan * p.pctOfPaid / 100);
  }, 0);
}

/**
 * Get consumption rate for a plan based on its index/name
 */
export function getConsumptionRate(
  planIndex: number,
  planName: string,
  inputs: Pick<EconomicsInputs, 'starterTokenConsumptionPct' | 'proTokenConsumptionPct' | 'enterpriseTokenConsumptionPct'>
): number {
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
  return inputs.proTokenConsumptionPct / 100;
}

/**
 * Calculate blended actual decks per paid user (consumption-adjusted)
 */
export function calcBlendedActualDecksPerPaidUser(
  plans: PlanConfig[],
  tokensPerDeck: number,
  inputs: Pick<EconomicsInputs, 'starterTokenConsumptionPct' | 'proTokenConsumptionPct' | 'enterpriseTokenConsumptionPct'>
): number {
  if (tokensPerDeck === 0) return 0;
  return plans.reduce((sum, p, i) => {
    const consumptionRate = getConsumptionRate(i, p.name, inputs);
    const tokensActuallyUsed = p.tokens * consumptionRate;
    const decksForPlan = tokensActuallyUsed / tokensPerDeck;
    return sum + (decksForPlan * p.pctOfPaid / 100);
  }, 0);
}

/**
 * Calculate Pro+ percentage (all plans except Starter/first plan)
 */
export function calcProPlusPct(plans: PlanConfig[]): number {
  if (plans.length <= 1) return 0;
  return plans.slice(1).reduce((sum, p) => sum + p.pctOfPaid, 0);
}

/**
 * Calculate blended decks for overage users (100% consumption before overage)
 */
export function calcBlendedDecksPerOverageUser(
  plans: PlanConfig[],
  tokensPerDeck: number,
  proPlusPct: number
): number {
  if (tokensPerDeck === 0 || proPlusPct === 0) return 0;
  return plans.slice(1).reduce((sum, p) => {
    const decksForPlan = p.tokens / tokensPerDeck;
    const proPlusShare = (p.pctOfPaid / proPlusPct) * 100;
    return sum + (decksForPlan * proPlusShare / 100);
  }, 0);
}

/**
 * Calculate effective paid conversion rate
 */
export function calcEffectivePaidConversionPct(paidConversionPct: number, freeToPayConvPct: number): number {
  const directPaidPct = paidConversionPct / 100;
  const freeToPaidPct = ((100 - paidConversionPct) / 100) * (freeToPayConvPct / 100);
  return (directPaidPct + freeToPaidPct) * 100;
}

/**
 * Main economics calculation
 */
export function calculateEconomics(
  inputs: EconomicsInputs,
  plans: PlanConfig[],
  userBreakdown: MonthlyUserBreakdown[],
  enterprise: EnterpriseConfig,
  totalUsers: number,
  costPerDeck: number,
  tokensPerDeck: number,
  blendedActualDecksPerPaidUser: number,
  blendedDecksPerOverageUser: number
): EconomicsResult {
  const {
    decksPerActiveUserMonth, paidConversionPct, freeToPayConvPct, churnPct, cac, freeTokens,
    overageEnabled, overagePctOfProUsers, overagePricePerToken, avgOverageTokensPerUser,
    starterUpgradePct, freeTokenConsumptionPct, monthlyGrowthPct
  } = inputs;

  // Free users: get tokens ONCE (not monthly), but only use X% of them
  const freeTokensActuallyUsed = freeTokens * (freeTokenConsumptionPct / 100);
  const freeDecksOneTime = tokensPerDeck > 0 ? freeTokensActuallyUsed / tokensPerDeck : 0;

  // Paid users: limited by their plan's tokens (monthly), adjusted for consumption rate
  const paidDecksPerUserMonth = Math.min(decksPerActiveUserMonth, blendedActualDecksPerPaidUser);

  // User funnel calculation for effective conversion rate
  const effectivePaidConversionPct = calcEffectivePaidConversionPct(paidConversionPct, freeToPayConvPct);
  const directPaidPct = paidConversionPct / 100;

  // Get user counts from userBreakdown (month 0 = current state)
  const currentBreakdown = userBreakdown[0] || { free: 0, starter: 0, pro: 0, team: 0, enterprise: 0, isManual: false };
  const starterUsers = currentBreakdown.starter;
  const proUsers = currentBreakdown.pro;
  const teamUsers = currentBreakdown.team;
  const enterpriseDeals = currentBreakdown.enterprise;
  const freeUsers = currentBreakdown.free;

  // Pro+ = Pro + Team (excludes enterprise)
  const proPlusUsers = proUsers + teamUsers;
  const estPaidUsers = starterUsers + proPlusUsers;
  const activeProPlusUsers = Math.ceil(proPlusUsers * 0.7);

  // Free user costs: new signups each month use their free trial
  const newSignupsPerMonth = Math.round(totalUsers * (monthlyGrowthPct / 100));
  const newFreeTrialUsers = Math.round(newSignupsPerMonth * (1 - directPaidPct));
  const freeTrialCostMonthly = newFreeTrialUsers * freeDecksOneTime * costPerDeck;

  // Plan info for pricing
  const proPlan = plans.find(p => p.name.toLowerCase().includes('pro')) || plans[1];
  const starterPlan = plans.find(p => p.name.toLowerCase().includes('starter')) || plans[0];
  const teamPlan = plans.find(p => p.name.toLowerCase().includes('team')) || plans[2];

  // Starter upgrade revenue
  const starterUpgradeUsers = Math.round(starterUsers * (starterUpgradePct / 100));
  const upgradeRevenue = proPlan && starterPlan ? starterUpgradeUsers * (proPlan.price - starterPlan.price) : 0;

  // Customer acquisition cost
  const acquisitionCostMonthly = newSignupsPerMonth * cac;

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

  // Enterprise costs
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

  // Enterprise revenue: amortized annual value / 12
  const enterpriseAnnualValue = enterprise.dealsPerYear * enterprise.avgDealSize;
  const enterpriseMonthlyAmortized = enterpriseAnnualValue / 12;

  // Overage revenue (if enabled)
  const overageRevenue = overageEnabled ? overageTokensTotal * overagePricePerToken : 0;
  const overageCost = overageEnabled ? (overageBaseCostMonthly - (overageUsers * normalProPlusDecksPerUser * costPerDeck)) + overageExtraCost : 0;

  const estMRR = subscriptionRevenue + overageRevenue + upgradeRevenue + enterpriseMonthlyAmortized;
  const totalMonthlyCost = monthlyCost;

  // Margins
  const totalPayingUsers = estPaidUsers + enterpriseDeals;
  const grossMargin = estMRR > 0 ? ((estMRR - totalMonthlyCost) / estMRR) * 100 : 0;
  const costPerPaidUser = totalPayingUsers > 0 ? totalMonthlyCost / totalPayingUsers : 0;
  const revenuePerPaidUser = totalPayingUsers > 0 ? estMRR / totalPayingUsers : calcBlendedARPU(plans);
  const profitPerPaidUser = revenuePerPaidUser - costPerPaidUser;

  // LTV/CAC
  const avgLifetimeMonths = churnPct > 0 ? (100 / churnPct) : 24;
  const ltv = revenuePerPaidUser * avgLifetimeMonths;
  const ltvCac = cac > 0 ? ltv / cac : 0;

  // Break-even
  const breakEvenPaidUsers = profitPerPaidUser > 0 ? Math.ceil(totalMonthlyCost / profitPerPaidUser) : 0;
  const paybackMonths = cac > 0 && profitPerPaidUser > 0 ? cac / profitPerPaidUser : 99;

  return {
    costPerDeck,
    tokensPerDeck,
    freeDecksOneTime,
    paidDecksPerUserMonth,
    totalCost: totalMonthlyCost,
    estPaidUsers: totalPayingUsers,
    freeUsers,
    estMRR,
    subscriptionRevenue,
    overageRevenue,
    overageCost,
    enterpriseRevenue: enterpriseMonthlyAmortized,
    enterpriseDeals,
    grossMargin,
    ltv,
    ltvCac,
    effectivePaidConversionPct,
    breakEvenPaidUsers,
    paybackMonths,
    netMonthly: estMRR - totalMonthlyCost,
    costPerPaidUser,
    profitPerPaidUser,
    blendedARPU: revenuePerPaidUser,
    freeTrialCostMonthly,
    newFreeTrialUsers,
    starterUsers,
    proPlusUsers,
    activeProPlusUsers,
    overageUsers,
    overageTokensTotal,
    upgradeRevenue,
    starterUpgradeUsers,
  };
}

/**
 * Format money with max 2 decimals, use K/M for large numbers
 */
export function fmtMoney(n: number, decimals = 2): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `${(n / 1_000).toFixed(0)}K`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(decimals);
}

/**
 * Format number with max decimals
 */
export function fmtNum(n: number, decimals = 0): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `${(n / 1_000).toFixed(0)}K`;
  if (Math.abs(n) >= 1_000) return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
  return n.toFixed(decimals);
}
