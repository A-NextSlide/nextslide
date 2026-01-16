import { describe, it, expect } from 'vitest';
import {
  calcOpCost,
  getOperationCosts,
  calcTokensPerDeck,
  calcCostPerDeck,
  calcBlendedARPU,
  calcBlendedTokensPerPaidUser,
  calcBlendedDecksPerPaidUser,
  calcBlendedActualDecksPerPaidUser,
  calcProPlusPct,
  calcBlendedDecksPerOverageUser,
  calcEffectivePaidConversionPct,
  calculateEconomics,
  getConsumptionRate,
  fmtMoney,
  fmtNum,
  MODEL_COSTS,
  OP_TOKENS,
  DEFAULT_PLANS,
  DEFAULT_INPUTS,
  PlanConfig,
  EconomicsInputs,
  MonthlyUserBreakdown,
  EnterpriseConfig,
} from './costModelCalculations';

describe('Cost Model Calculations', () => {
  // ============================================================================
  // calcOpCost - Operation cost calculation
  // ============================================================================
  describe('calcOpCost', () => {
    it('calculates slide generation cost correctly', () => {
      // slideGen: input=850, output=7700, model=gemini
      // gemini: input=$2/1M, output=$12/1M
      // Cost = (850 * 2 + 7700 * 12) / 1,000,000 = (1700 + 92400) / 1,000,000 = 0.0941
      const cost = calcOpCost('slideGen');
      expect(cost).toBeCloseTo(0.0941, 4);
    });

    it('calculates theme generation cost correctly', () => {
      // themeGen: input=500, output=2000, model=gemini
      // Cost = (500 * 2 + 2000 * 12) / 1,000,000 = (1000 + 24000) / 1,000,000 = 0.025
      const cost = calcOpCost('themeGen');
      expect(cost).toBeCloseTo(0.025, 4);
    });

    it('calculates research cost correctly', () => {
      // research: input=500, output=2500, model=perplexity
      // perplexity: input=$1/1M, output=$5/1M
      // Cost = (500 * 1 + 2500 * 5) / 1,000,000 = (500 + 12500) / 1,000,000 = 0.013
      const cost = calcOpCost('research');
      expect(cost).toBeCloseTo(0.013, 4);
    });

    it('calculates edit cost correctly', () => {
      // edit: input=1500, output=6500, model=gemini
      // Cost = (1500 * 2 + 6500 * 12) / 1,000,000 = (3000 + 78000) / 1,000,000 = 0.081
      const cost = calcOpCost('edit');
      expect(cost).toBeCloseTo(0.081, 4);
    });

    it('calculates routing cost correctly', () => {
      // routing: input=500, output=300, model=haiku
      // haiku: input=$0.80/1M, output=$4/1M
      // Cost = (500 * 0.8 + 300 * 4) / 1,000,000 = (400 + 1200) / 1,000,000 = 0.0016
      const cost = calcOpCost('routing');
      expect(cost).toBeCloseTo(0.0016, 4);
    });

    it('returns 0 for unknown model', () => {
      const customOps = {
        test: { input: 100, output: 100, model: 'unknown' }
      };
      const cost = calcOpCost('test' as any, MODEL_COSTS, customOps);
      expect(cost).toBe(0);
    });
  });

  // ============================================================================
  // getOperationCosts - All operation costs
  // ============================================================================
  describe('getOperationCosts', () => {
    it('returns all operation costs', () => {
      const costs = getOperationCosts();
      expect(costs.slideGen).toBeCloseTo(0.0941, 4);
      expect(costs.themeGen).toBeCloseTo(0.025, 4);
      expect(costs.research).toBeCloseTo(0.013, 4);
      expect(costs.edit).toBeCloseTo(0.081, 4);
      expect(costs.routing).toBeCloseTo(0.0016, 4);
    });
  });

  // ============================================================================
  // calcTokensPerDeck - Tokens consumed per deck
  // ============================================================================
  describe('calcTokensPerDeck', () => {
    it('calculates tokens per deck with default inputs', () => {
      // Default: 10 slides × 5 tokens + 2 edits × 5 tokens + 1 research × 5 tokens
      // = 50 + 10 + 5 = 65
      const tokens = calcTokensPerDeck(DEFAULT_INPUTS);
      expect(tokens).toBe(65);
    });

    it('calculates with custom inputs', () => {
      const inputs = { ...DEFAULT_INPUTS, slidesPerDeck: 5, tokensPerSlide: 20, editsPerDeck: 3, tokensPerEdit: 10, researchCallsPerDeck: 2, tokensPerResearch: 8 };
      // 5 × 20 + 3 × 10 + 2 × 8 = 100 + 30 + 16 = 146
      const tokens = calcTokensPerDeck(inputs);
      expect(tokens).toBe(146);
    });

    it('handles zero slides', () => {
      const inputs = { ...DEFAULT_INPUTS, slidesPerDeck: 0 };
      // 0 × 10 + 2 × 5 + 1 × 5 = 0 + 10 + 5 = 15
      const tokens = calcTokensPerDeck(inputs);
      expect(tokens).toBe(15);
    });
  });

  // ============================================================================
  // calcCostPerDeck - API cost per deck
  // ============================================================================
  describe('calcCostPerDeck', () => {
    it('calculates cost per deck correctly', () => {
      const costs = getOperationCosts();
      const inputs = {
        ...DEFAULT_INPUTS,
        apiCostPerSlide: costs.slideGen,
        apiCostPerEdit: costs.edit,
        apiCostPerResearch: costs.research,
        apiCostPerTheme: costs.themeGen,
      };
      // theme + (10 slides × slideGen) + (1 research × research) + (2 edits × edit) + (3 × routing)
      // = 0.025 + (10 × 0.0941) + (1 × 0.013) + (2 × 0.081) + (3 × 0.0016)
      // = 0.025 + 0.941 + 0.013 + 0.162 + 0.0048
      // = 1.1458
      const cost = calcCostPerDeck(inputs, costs.routing);
      expect(cost).toBeCloseTo(1.1458, 3);
    });

    it('handles zero slides', () => {
      const costs = getOperationCosts();
      const inputs = {
        ...DEFAULT_INPUTS,
        slidesPerDeck: 0,
        apiCostPerSlide: costs.slideGen,
        apiCostPerEdit: costs.edit,
        apiCostPerResearch: costs.research,
        apiCostPerTheme: costs.themeGen,
      };
      // theme + 0 + research + (2 × edit) + (3 × routing)
      const cost = calcCostPerDeck(inputs, costs.routing);
      expect(cost).toBeCloseTo(0.025 + 0.013 + 0.162 + 0.0048, 3);
    });
  });

  // ============================================================================
  // calcBlendedARPU - Weighted average revenue per user
  // ============================================================================
  describe('calcBlendedARPU', () => {
    it('calculates blended ARPU with default plans', () => {
      // Starter: $12 × 70% + Pro: $24 × 25% + Team: $49 × 5%
      // = 8.4 + 6 + 2.45 = 16.85
      const arpu = calcBlendedARPU(DEFAULT_PLANS);
      expect(arpu).toBeCloseTo(16.85, 2);
    });

    it('calculates with custom plans', () => {
      const plans: PlanConfig[] = [
        { name: 'Basic', price: 10, tokens: 100, pctOfPaid: 50 },
        { name: 'Premium', price: 30, tokens: 500, pctOfPaid: 50 },
      ];
      // $10 × 50% + $30 × 50% = 5 + 15 = 20
      const arpu = calcBlendedARPU(plans);
      expect(arpu).toBe(20);
    });

    it('handles single plan at 100%', () => {
      const plans: PlanConfig[] = [
        { name: 'Only', price: 25, tokens: 1000, pctOfPaid: 100 },
      ];
      const arpu = calcBlendedARPU(plans);
      expect(arpu).toBe(25);
    });

    it('handles empty plans', () => {
      const arpu = calcBlendedARPU([]);
      expect(arpu).toBe(0);
    });
  });

  // ============================================================================
  // calcBlendedTokensPerPaidUser - Weighted average tokens
  // ============================================================================
  describe('calcBlendedTokensPerPaidUser', () => {
    it('calculates blended tokens with default plans', () => {
      // Starter: 500 × 70% + Pro: 1500 × 25% + Team: 5000 × 5%
      // = 350 + 375 + 250 = 975
      const tokens = calcBlendedTokensPerPaidUser(DEFAULT_PLANS);
      expect(tokens).toBe(975);
    });

    it('handles empty plans', () => {
      const tokens = calcBlendedTokensPerPaidUser([]);
      expect(tokens).toBe(0);
    });
  });

  // ============================================================================
  // calcBlendedDecksPerPaidUser - Decks at 100% token usage
  // ============================================================================
  describe('calcBlendedDecksPerPaidUser', () => {
    const tokensPerDeck = 115; // Default

    it('calculates blended decks with default plans', () => {
      // Starter: floor(500/115) = 4 decks × 70% = 2.8
      // Pro: floor(1500/115) = 13 decks × 25% = 3.25
      // Team: floor(5000/115) = 43 decks × 5% = 2.15
      // Total = 2.8 + 3.25 + 2.15 = 8.2
      const decks = calcBlendedDecksPerPaidUser(DEFAULT_PLANS, tokensPerDeck);
      expect(decks).toBeCloseTo(8.2, 1);
    });

    it('returns 0 when tokensPerDeck is 0', () => {
      const decks = calcBlendedDecksPerPaidUser(DEFAULT_PLANS, 0);
      expect(decks).toBe(0);
    });

    it('handles empty plans', () => {
      const decks = calcBlendedDecksPerPaidUser([], tokensPerDeck);
      expect(decks).toBe(0);
    });
  });

  // ============================================================================
  // getConsumptionRate - Plan consumption rate lookup
  // ============================================================================
  describe('getConsumptionRate', () => {
    const inputs = {
      starterTokenConsumptionPct: 60,
      proTokenConsumptionPct: 75,
      enterpriseTokenConsumptionPct: 50,
    };

    it('returns starter rate for first plan', () => {
      expect(getConsumptionRate(0, 'Starter', inputs)).toBe(0.60);
    });

    it('returns starter rate for plan with "starter" in name', () => {
      expect(getConsumptionRate(5, 'My Starter Plan', inputs)).toBe(0.60);
    });

    it('returns starter rate for plan with "basic" in name', () => {
      expect(getConsumptionRate(3, 'Basic', inputs)).toBe(0.60);
    });

    it('returns pro rate for plan with "pro" in name', () => {
      expect(getConsumptionRate(1, 'Pro', inputs)).toBe(0.75);
    });

    it('returns enterprise rate for plan with "enterprise" in name', () => {
      expect(getConsumptionRate(2, 'Enterprise', inputs)).toBe(0.50);
    });

    it('returns enterprise rate for plan with "team" in name', () => {
      expect(getConsumptionRate(2, 'Team', inputs)).toBe(0.50);
    });

    it('defaults to pro rate for unknown plans', () => {
      expect(getConsumptionRate(2, 'Unknown', inputs)).toBe(0.75);
    });
  });

  // ============================================================================
  // calcBlendedActualDecksPerPaidUser - Consumption-adjusted decks
  // ============================================================================
  describe('calcBlendedActualDecksPerPaidUser', () => {
    const tokensPerDeck = 115;
    const inputs = {
      starterTokenConsumptionPct: 60,
      proTokenConsumptionPct: 75,
      enterpriseTokenConsumptionPct: 50,
    };

    it('calculates consumption-adjusted decks', () => {
      // Starter: 500 × 60% = 300 tokens → 300/115 = 2.61 decks × 70% = 1.83
      // Pro: 1500 × 75% = 1125 tokens → 1125/115 = 9.78 decks × 25% = 2.45
      // Team: 5000 × 50% = 2500 tokens → 2500/115 = 21.74 decks × 5% = 1.09
      // Total = 1.83 + 2.45 + 1.09 = 5.37
      const decks = calcBlendedActualDecksPerPaidUser(DEFAULT_PLANS, tokensPerDeck, inputs);
      expect(decks).toBeCloseTo(5.37, 1);
    });

    it('returns 0 when tokensPerDeck is 0', () => {
      const decks = calcBlendedActualDecksPerPaidUser(DEFAULT_PLANS, 0, inputs);
      expect(decks).toBe(0);
    });
  });

  // ============================================================================
  // calcProPlusPct - Pro+ percentage
  // ============================================================================
  describe('calcProPlusPct', () => {
    it('calculates Pro+ percentage (all plans except first)', () => {
      // Pro: 25% + Team: 5% = 30%
      const pct = calcProPlusPct(DEFAULT_PLANS);
      expect(pct).toBe(30);
    });

    it('returns 0 for single plan', () => {
      const pct = calcProPlusPct([DEFAULT_PLANS[0]]);
      expect(pct).toBe(0);
    });

    it('returns 0 for empty plans', () => {
      const pct = calcProPlusPct([]);
      expect(pct).toBe(0);
    });
  });

  // ============================================================================
  // calcBlendedDecksPerOverageUser - Decks for overage users
  // ============================================================================
  describe('calcBlendedDecksPerOverageUser', () => {
    const tokensPerDeck = 115;
    const proPlusPct = 30; // 25% Pro + 5% Team

    it('calculates overage user decks (100% consumption)', () => {
      // Only Pro+ plans (not Starter):
      // Pro: 1500/115 = 13.04 decks × (25/30 × 100)% = 10.87
      // Team: 5000/115 = 43.48 decks × (5/30 × 100)% = 7.25
      // Total = 10.87 + 7.25 = 18.12
      const decks = calcBlendedDecksPerOverageUser(DEFAULT_PLANS, tokensPerDeck, proPlusPct);
      expect(decks).toBeCloseTo(18.12, 1);
    });

    it('returns 0 when tokensPerDeck is 0', () => {
      const decks = calcBlendedDecksPerOverageUser(DEFAULT_PLANS, 0, proPlusPct);
      expect(decks).toBe(0);
    });

    it('returns 0 when proPlusPct is 0', () => {
      const decks = calcBlendedDecksPerOverageUser(DEFAULT_PLANS, tokensPerDeck, 0);
      expect(decks).toBe(0);
    });
  });

  // ============================================================================
  // calcEffectivePaidConversionPct - Effective conversion rate
  // ============================================================================
  describe('calcEffectivePaidConversionPct', () => {
    it('calculates with default values', () => {
      // Direct: 2% = 0.02
      // Free trial → paid: (100-2)% × 10% = 98% × 10% = 9.8% = 0.098
      // Total: 0.02 + 0.098 = 0.118 = 11.8%
      const pct = calcEffectivePaidConversionPct(2, 10);
      expect(pct).toBeCloseTo(11.8, 1);
    });

    it('calculates with high direct conversion', () => {
      // Direct: 50% = 0.5
      // Free trial → paid: (100-50)% × 20% = 50% × 20% = 10% = 0.1
      // Total: 0.5 + 0.1 = 0.6 = 60%
      const pct = calcEffectivePaidConversionPct(50, 20);
      expect(pct).toBe(60);
    });

    it('handles 100% direct conversion', () => {
      // Direct: 100%
      // Free trial → paid: 0% × anything = 0
      // Total: 100%
      const pct = calcEffectivePaidConversionPct(100, 50);
      expect(pct).toBe(100);
    });

    it('handles 0% direct conversion', () => {
      // Direct: 0%
      // Free trial → paid: 100% × 15% = 15%
      // Total: 15%
      const pct = calcEffectivePaidConversionPct(0, 15);
      expect(pct).toBe(15);
    });
  });

  // ============================================================================
  // calculateEconomics - Main economics calculation
  // ============================================================================
  describe('calculateEconomics', () => {
    const costs = getOperationCosts();
    const inputs: EconomicsInputs = {
      ...DEFAULT_INPUTS,
      apiCostPerSlide: costs.slideGen,
      apiCostPerEdit: costs.edit,
      apiCostPerResearch: costs.research,
      apiCostPerTheme: costs.themeGen,
    };
    const tokensPerDeck = calcTokensPerDeck(inputs);
    const costPerDeck = calcCostPerDeck(inputs, costs.routing);
    const blendedActual = calcBlendedActualDecksPerPaidUser(DEFAULT_PLANS, tokensPerDeck, inputs);
    const proPlusPct = calcProPlusPct(DEFAULT_PLANS);
    const blendedOverage = calcBlendedDecksPerOverageUser(DEFAULT_PLANS, tokensPerDeck, proPlusPct);

    const userBreakdown: MonthlyUserBreakdown[] = [
      { free: 90, starter: 7, pro: 2, team: 1, enterprise: 0, oneOffSpend: 0, isManual: false }
    ];
    const enterprise: EnterpriseConfig = { dealsPerYear: 2, avgDealSize: 10000, dealMonths: [] };
    const totalUsers = 100;

    it('calculates subscription revenue correctly', () => {
      const result = calculateEconomics(inputs, DEFAULT_PLANS, userBreakdown, enterprise, totalUsers, costPerDeck, tokensPerDeck, blendedActual, blendedOverage);
      // Starter: 7 × $12 = $84
      // Pro: 2 × $24 = $48
      // Team: 1 × $49 = $49
      // Total: $84 + $48 + $49 = $181
      expect(result.subscriptionRevenue).toBe(181);
    });

    it('calculates enterprise revenue (amortized)', () => {
      const result = calculateEconomics(inputs, DEFAULT_PLANS, userBreakdown, enterprise, totalUsers, costPerDeck, tokensPerDeck, blendedActual, blendedOverage);
      // 2 deals × $10000 / 12 months = $1666.67/month
      expect(result.enterpriseRevenue).toBeCloseTo(1666.67, 0);
    });

    it('calculates effective conversion percentage', () => {
      const result = calculateEconomics(inputs, DEFAULT_PLANS, userBreakdown, enterprise, totalUsers, costPerDeck, tokensPerDeck, blendedActual, blendedOverage);
      expect(result.effectivePaidConversionPct).toBeCloseTo(11.8, 1);
    });

    it('calculates LTV correctly', () => {
      const result = calculateEconomics(inputs, DEFAULT_PLANS, userBreakdown, enterprise, totalUsers, costPerDeck, tokensPerDeck, blendedActual, blendedOverage);
      // avgLifetimeMonths = 100 / 5% = 20 months
      // revenuePerPaidUser = estMRR / totalPayingUsers
      expect(result.ltv).toBeGreaterThan(0);
    });

    it('calculates LTV:CAC ratio', () => {
      const result = calculateEconomics(inputs, DEFAULT_PLANS, userBreakdown, enterprise, totalUsers, costPerDeck, tokensPerDeck, blendedActual, blendedOverage);
      // Should be positive with positive revenue
      expect(result.ltvCac).toBeGreaterThan(0);
    });

    it('handles overage when enabled', () => {
      const overageInputs = { ...inputs, overageEnabled: true, overagePctOfProUsers: 20, avgOverageTokensPerUser: 50, overagePricePerToken: 0.10 };
      const result = calculateEconomics(overageInputs, DEFAULT_PLANS, userBreakdown, enterprise, totalUsers, costPerDeck, tokensPerDeck, blendedActual, blendedOverage);
      expect(result.overageRevenue).toBeGreaterThan(0);
      expect(result.overageUsers).toBeGreaterThan(0);
    });

    it('handles overage disabled', () => {
      const noOverageInputs = { ...inputs, overageEnabled: false };
      const result = calculateEconomics(noOverageInputs, DEFAULT_PLANS, userBreakdown, enterprise, totalUsers, costPerDeck, tokensPerDeck, blendedActual, blendedOverage);
      expect(result.overageRevenue).toBe(0);
      expect(result.overageUsers).toBe(0);
    });

    it('calculates starter upgrade revenue', () => {
      const result = calculateEconomics(inputs, DEFAULT_PLANS, userBreakdown, enterprise, totalUsers, costPerDeck, tokensPerDeck, blendedActual, blendedOverage);
      // 15% of 7 starter users = ~1 user upgrades
      // Upgrade revenue = 1 × (24 - 12) = $12
      expect(result.starterUpgradeUsers).toBe(1);
      expect(result.upgradeRevenue).toBe(12);
    });

    it('calculates free trial users and cost', () => {
      const result = calculateEconomics(inputs, DEFAULT_PLANS, userBreakdown, enterprise, totalUsers, costPerDeck, tokensPerDeck, blendedActual, blendedOverage);
      // newSignups = 100 × 10% = 10
      // newFreeTrialUsers = 10 × (1 - 2%) = 10 × 0.98 = ~10
      expect(result.newFreeTrialUsers).toBeGreaterThan(0);
      expect(result.freeTrialCostMonthly).toBeGreaterThan(0);
    });

    it('handles empty user breakdown', () => {
      const emptyBreakdown: MonthlyUserBreakdown[] = [];
      const result = calculateEconomics(inputs, DEFAULT_PLANS, emptyBreakdown, enterprise, totalUsers, costPerDeck, tokensPerDeck, blendedActual, blendedOverage);
      expect(result.subscriptionRevenue).toBe(0);
      expect(result.starterUsers).toBe(0);
    });
  });

  // ============================================================================
  // Formatting functions
  // ============================================================================
  describe('fmtMoney', () => {
    it('formats millions', () => {
      expect(fmtMoney(1500000)).toBe('1.5M');
      expect(fmtMoney(2000000)).toBe('2.0M');
    });

    it('formats ten thousands (no decimals)', () => {
      expect(fmtMoney(15000)).toBe('15K');
      expect(fmtMoney(99999)).toBe('100K');
    });

    it('formats thousands (with decimals)', () => {
      expect(fmtMoney(1500)).toBe('1.5K');
      expect(fmtMoney(2500)).toBe('2.5K');
    });

    it('formats small numbers with decimals', () => {
      expect(fmtMoney(123.456)).toBe('123.46');
      expect(fmtMoney(0.123)).toBe('0.12');
    });

    it('handles negative numbers', () => {
      expect(fmtMoney(-1500000)).toBe('-1.5M');
      expect(fmtMoney(-15000)).toBe('-15K');
    });
  });

  describe('fmtNum', () => {
    it('formats millions', () => {
      expect(fmtNum(1500000)).toBe('1.5M');
    });

    it('formats ten thousands', () => {
      expect(fmtNum(15000)).toBe('15K');
    });

    it('formats thousands with locale', () => {
      const result = fmtNum(1500);
      expect(result).toMatch(/1[,.]?500/); // Locale-dependent
    });

    it('formats small numbers', () => {
      expect(fmtNum(123)).toBe('123');
    });
  });

  // ============================================================================
  // Integration tests - Model coherence
  // ============================================================================
  describe('Model coherence', () => {
    it('revenue should equal sum of all revenue streams', () => {
      const costs = getOperationCosts();
      const inputs: EconomicsInputs = {
        ...DEFAULT_INPUTS,
        apiCostPerSlide: costs.slideGen,
        apiCostPerEdit: costs.edit,
        apiCostPerResearch: costs.research,
        apiCostPerTheme: costs.themeGen,
        overageEnabled: true,
      };
      const tokensPerDeck = calcTokensPerDeck(inputs);
      const costPerDeck = calcCostPerDeck(inputs, costs.routing);
      const blendedActual = calcBlendedActualDecksPerPaidUser(DEFAULT_PLANS, tokensPerDeck, inputs);
      const proPlusPct = calcProPlusPct(DEFAULT_PLANS);
      const blendedOverage = calcBlendedDecksPerOverageUser(DEFAULT_PLANS, tokensPerDeck, proPlusPct);
      const userBreakdown: MonthlyUserBreakdown[] = [
        { free: 90, starter: 7, pro: 2, team: 1, enterprise: 1, oneOffSpend: 0, isManual: false }
      ];
      const enterprise: EnterpriseConfig = { dealsPerYear: 2, avgDealSize: 10000, dealMonths: [] };

      const result = calculateEconomics(inputs, DEFAULT_PLANS, userBreakdown, enterprise, 100, costPerDeck, tokensPerDeck, blendedActual, blendedOverage);

      // estMRR = subscriptionRevenue + overageRevenue + upgradeRevenue + enterpriseRevenue
      const expectedMRR = result.subscriptionRevenue + result.overageRevenue + result.upgradeRevenue + result.enterpriseRevenue;
      expect(result.estMRR).toBeCloseTo(expectedMRR, 2);
    });

    it('gross margin formula is consistent', () => {
      const costs = getOperationCosts();
      const inputs: EconomicsInputs = {
        ...DEFAULT_INPUTS,
        apiCostPerSlide: costs.slideGen,
        apiCostPerEdit: costs.edit,
        apiCostPerResearch: costs.research,
        apiCostPerTheme: costs.themeGen,
      };
      const tokensPerDeck = calcTokensPerDeck(inputs);
      const costPerDeck = calcCostPerDeck(inputs, costs.routing);
      const blendedActual = calcBlendedActualDecksPerPaidUser(DEFAULT_PLANS, tokensPerDeck, inputs);
      const proPlusPct = calcProPlusPct(DEFAULT_PLANS);
      const blendedOverage = calcBlendedDecksPerOverageUser(DEFAULT_PLANS, tokensPerDeck, proPlusPct);
      const userBreakdown: MonthlyUserBreakdown[] = [
        { free: 90, starter: 7, pro: 2, team: 1, enterprise: 0, oneOffSpend: 0, isManual: false }
      ];
      const enterprise: EnterpriseConfig = { dealsPerYear: 2, avgDealSize: 10000, dealMonths: [] };

      const result = calculateEconomics(inputs, DEFAULT_PLANS, userBreakdown, enterprise, 100, costPerDeck, tokensPerDeck, blendedActual, blendedOverage);

      // grossMargin = (estMRR - totalCost) / estMRR * 100
      if (result.estMRR > 0) {
        const expectedMargin = ((result.estMRR - result.totalCost) / result.estMRR) * 100;
        expect(result.grossMargin).toBeCloseTo(expectedMargin, 2);
      }
    });

    it('netMonthly equals revenue minus cost', () => {
      const costs = getOperationCosts();
      const inputs: EconomicsInputs = {
        ...DEFAULT_INPUTS,
        apiCostPerSlide: costs.slideGen,
        apiCostPerEdit: costs.edit,
        apiCostPerResearch: costs.research,
        apiCostPerTheme: costs.themeGen,
      };
      const tokensPerDeck = calcTokensPerDeck(inputs);
      const costPerDeck = calcCostPerDeck(inputs, costs.routing);
      const blendedActual = calcBlendedActualDecksPerPaidUser(DEFAULT_PLANS, tokensPerDeck, inputs);
      const proPlusPct = calcProPlusPct(DEFAULT_PLANS);
      const blendedOverage = calcBlendedDecksPerOverageUser(DEFAULT_PLANS, tokensPerDeck, proPlusPct);
      const userBreakdown: MonthlyUserBreakdown[] = [
        { free: 90, starter: 7, pro: 2, team: 1, enterprise: 0, oneOffSpend: 0, isManual: false }
      ];
      const enterprise: EnterpriseConfig = { dealsPerYear: 2, avgDealSize: 10000, dealMonths: [] };

      const result = calculateEconomics(inputs, DEFAULT_PLANS, userBreakdown, enterprise, 100, costPerDeck, tokensPerDeck, blendedActual, blendedOverage);

      expect(result.netMonthly).toBeCloseTo(result.estMRR - result.totalCost, 2);
    });

    it('plan percentages should sum to 100%', () => {
      const total = DEFAULT_PLANS.reduce((sum, p) => sum + p.pctOfPaid, 0);
      expect(total).toBe(100);
    });

    it('blended values should be weighted averages', () => {
      // Blended ARPU should be between min and max plan prices
      const arpu = calcBlendedARPU(DEFAULT_PLANS);
      const minPrice = Math.min(...DEFAULT_PLANS.map(p => p.price));
      const maxPrice = Math.max(...DEFAULT_PLANS.map(p => p.price));
      expect(arpu).toBeGreaterThanOrEqual(minPrice);
      expect(arpu).toBeLessThanOrEqual(maxPrice);
    });
  });

  // ============================================================================
  // Edge cases
  // ============================================================================
  describe('Edge cases', () => {
    it('handles zero users', () => {
      const costs = getOperationCosts();
      const inputs: EconomicsInputs = {
        ...DEFAULT_INPUTS,
        apiCostPerSlide: costs.slideGen,
        apiCostPerEdit: costs.edit,
        apiCostPerResearch: costs.research,
        apiCostPerTheme: costs.themeGen,
      };
      const tokensPerDeck = calcTokensPerDeck(inputs);
      const costPerDeck = calcCostPerDeck(inputs, costs.routing);
      const blendedActual = calcBlendedActualDecksPerPaidUser(DEFAULT_PLANS, tokensPerDeck, inputs);
      const proPlusPct = calcProPlusPct(DEFAULT_PLANS);
      const blendedOverage = calcBlendedDecksPerOverageUser(DEFAULT_PLANS, tokensPerDeck, proPlusPct);
      const emptyBreakdown: MonthlyUserBreakdown[] = [];
      const enterprise: EnterpriseConfig = { dealsPerYear: 0, avgDealSize: 0, dealMonths: [] };

      const result = calculateEconomics(inputs, DEFAULT_PLANS, emptyBreakdown, enterprise, 0, costPerDeck, tokensPerDeck, blendedActual, blendedOverage);

      expect(result.subscriptionRevenue).toBe(0);
      expect(result.estPaidUsers).toBe(0);
    });

    it('handles zero CAC', () => {
      const costs = getOperationCosts();
      const inputs: EconomicsInputs = {
        ...DEFAULT_INPUTS,
        cac: 0,
        apiCostPerSlide: costs.slideGen,
        apiCostPerEdit: costs.edit,
        apiCostPerResearch: costs.research,
        apiCostPerTheme: costs.themeGen,
      };
      const tokensPerDeck = calcTokensPerDeck(inputs);
      const costPerDeck = calcCostPerDeck(inputs, costs.routing);
      const blendedActual = calcBlendedActualDecksPerPaidUser(DEFAULT_PLANS, tokensPerDeck, inputs);
      const proPlusPct = calcProPlusPct(DEFAULT_PLANS);
      const blendedOverage = calcBlendedDecksPerOverageUser(DEFAULT_PLANS, tokensPerDeck, proPlusPct);
      const userBreakdown: MonthlyUserBreakdown[] = [
        { free: 90, starter: 7, pro: 2, team: 1, enterprise: 0, oneOffSpend: 0, isManual: false }
      ];
      const enterprise: EnterpriseConfig = { dealsPerYear: 2, avgDealSize: 10000, dealMonths: [] };

      const result = calculateEconomics(inputs, DEFAULT_PLANS, userBreakdown, enterprise, 100, costPerDeck, tokensPerDeck, blendedActual, blendedOverage);

      expect(result.ltvCac).toBe(0); // Division by zero protection
    });

    it('handles zero churn (infinite lifetime)', () => {
      const costs = getOperationCosts();
      const inputs: EconomicsInputs = {
        ...DEFAULT_INPUTS,
        churnPct: 0,
        apiCostPerSlide: costs.slideGen,
        apiCostPerEdit: costs.edit,
        apiCostPerResearch: costs.research,
        apiCostPerTheme: costs.themeGen,
      };
      const tokensPerDeck = calcTokensPerDeck(inputs);
      const costPerDeck = calcCostPerDeck(inputs, costs.routing);
      const blendedActual = calcBlendedActualDecksPerPaidUser(DEFAULT_PLANS, tokensPerDeck, inputs);
      const proPlusPct = calcProPlusPct(DEFAULT_PLANS);
      const blendedOverage = calcBlendedDecksPerOverageUser(DEFAULT_PLANS, tokensPerDeck, proPlusPct);
      const userBreakdown: MonthlyUserBreakdown[] = [
        { free: 90, starter: 7, pro: 2, team: 1, enterprise: 0, oneOffSpend: 0, isManual: false }
      ];
      const enterprise: EnterpriseConfig = { dealsPerYear: 2, avgDealSize: 10000, dealMonths: [] };

      const result = calculateEconomics(inputs, DEFAULT_PLANS, userBreakdown, enterprise, 100, costPerDeck, tokensPerDeck, blendedActual, blendedOverage);

      // With 0% churn, avgLifetimeMonths should be capped at 24
      // LTV = revenuePerPaidUser × 24
      expect(result.ltv).toBeGreaterThan(0);
    });

    it('handles very high growth rate', () => {
      const costs = getOperationCosts();
      const inputs: EconomicsInputs = {
        ...DEFAULT_INPUTS,
        monthlyGrowthPct: 100, // 100% monthly growth
        apiCostPerSlide: costs.slideGen,
        apiCostPerEdit: costs.edit,
        apiCostPerResearch: costs.research,
        apiCostPerTheme: costs.themeGen,
      };
      const tokensPerDeck = calcTokensPerDeck(inputs);
      const costPerDeck = calcCostPerDeck(inputs, costs.routing);
      const blendedActual = calcBlendedActualDecksPerPaidUser(DEFAULT_PLANS, tokensPerDeck, inputs);
      const proPlusPct = calcProPlusPct(DEFAULT_PLANS);
      const blendedOverage = calcBlendedDecksPerOverageUser(DEFAULT_PLANS, tokensPerDeck, proPlusPct);
      const userBreakdown: MonthlyUserBreakdown[] = [
        { free: 90, starter: 7, pro: 2, team: 1, enterprise: 0, oneOffSpend: 0, isManual: false }
      ];
      const enterprise: EnterpriseConfig = { dealsPerYear: 0, avgDealSize: 0, dealMonths: [] };

      const result = calculateEconomics(inputs, DEFAULT_PLANS, userBreakdown, enterprise, 100, costPerDeck, tokensPerDeck, blendedActual, blendedOverage);

      // Should have high free trial costs due to many new signups
      expect(result.newFreeTrialUsers).toBe(98); // 100 × 100% × (1 - 2%)
    });
  });

  // ============================================================================
  // Toggle effects - Verify inputs affect model correctly
  // ============================================================================
  describe('Toggle effects', () => {
    const costs = getOperationCosts();
    const baseInputs: EconomicsInputs = {
      ...DEFAULT_INPUTS,
      apiCostPerSlide: costs.slideGen,
      apiCostPerEdit: costs.edit,
      apiCostPerResearch: costs.research,
      apiCostPerTheme: costs.themeGen,
    };
    const userBreakdown: MonthlyUserBreakdown[] = [
      { free: 90, starter: 7, pro: 2, team: 1, enterprise: 0, oneOffSpend: 0, isManual: false }
    ];
    const enterprise: EnterpriseConfig = { dealsPerYear: 2, avgDealSize: 10000, dealMonths: [] };

    it('increasing slides per deck increases cost per deck', () => {
      const inputs1 = { ...baseInputs, slidesPerDeck: 5 };
      const inputs2 = { ...baseInputs, slidesPerDeck: 15 };
      const cost1 = calcCostPerDeck(inputs1, costs.routing);
      const cost2 = calcCostPerDeck(inputs2, costs.routing);
      expect(cost2).toBeGreaterThan(cost1);
    });

    it('increasing slides per deck increases tokens per deck', () => {
      const inputs1 = { ...baseInputs, slidesPerDeck: 5 };
      const inputs2 = { ...baseInputs, slidesPerDeck: 15 };
      const tokens1 = calcTokensPerDeck(inputs1);
      const tokens2 = calcTokensPerDeck(inputs2);
      expect(tokens2).toBeGreaterThan(tokens1);
    });

    it('higher consumption rate increases costs', () => {
      const lowConsumption = {
        starterTokenConsumptionPct: 30,
        proTokenConsumptionPct: 30,
        enterpriseTokenConsumptionPct: 30,
      };
      const highConsumption = {
        starterTokenConsumptionPct: 90,
        proTokenConsumptionPct: 90,
        enterpriseTokenConsumptionPct: 90,
      };
      const tokensPerDeck = calcTokensPerDeck(baseInputs);
      const decksLow = calcBlendedActualDecksPerPaidUser(DEFAULT_PLANS, tokensPerDeck, lowConsumption);
      const decksHigh = calcBlendedActualDecksPerPaidUser(DEFAULT_PLANS, tokensPerDeck, highConsumption);
      expect(decksHigh).toBeGreaterThan(decksLow);
    });

    it('enabling overage adds revenue', () => {
      const tokensPerDeck = calcTokensPerDeck(baseInputs);
      const costPerDeck = calcCostPerDeck(baseInputs, costs.routing);
      const blendedActual = calcBlendedActualDecksPerPaidUser(DEFAULT_PLANS, tokensPerDeck, baseInputs);
      const proPlusPct = calcProPlusPct(DEFAULT_PLANS);
      const blendedOverage = calcBlendedDecksPerOverageUser(DEFAULT_PLANS, tokensPerDeck, proPlusPct);

      const noOverage = calculateEconomics(
        { ...baseInputs, overageEnabled: false },
        DEFAULT_PLANS, userBreakdown, enterprise, 100, costPerDeck, tokensPerDeck, blendedActual, blendedOverage
      );
      const withOverage = calculateEconomics(
        { ...baseInputs, overageEnabled: true, overagePctOfProUsers: 20, avgOverageTokensPerUser: 100, overagePricePerToken: 0.10 },
        DEFAULT_PLANS, userBreakdown, enterprise, 100, costPerDeck, tokensPerDeck, blendedActual, blendedOverage
      );

      expect(withOverage.overageRevenue).toBeGreaterThan(noOverage.overageRevenue);
    });

    it('higher CAC increases payback months', () => {
      const tokensPerDeck = calcTokensPerDeck(baseInputs);
      const costPerDeck = calcCostPerDeck(baseInputs, costs.routing);
      const blendedActual = calcBlendedActualDecksPerPaidUser(DEFAULT_PLANS, tokensPerDeck, baseInputs);
      const proPlusPct = calcProPlusPct(DEFAULT_PLANS);
      const blendedOverage = calcBlendedDecksPerOverageUser(DEFAULT_PLANS, tokensPerDeck, proPlusPct);

      const lowCac = calculateEconomics(
        { ...baseInputs, cac: 10 },
        DEFAULT_PLANS, userBreakdown, enterprise, 100, costPerDeck, tokensPerDeck, blendedActual, blendedOverage
      );
      const highCac = calculateEconomics(
        { ...baseInputs, cac: 50 },
        DEFAULT_PLANS, userBreakdown, enterprise, 100, costPerDeck, tokensPerDeck, blendedActual, blendedOverage
      );

      expect(highCac.paybackMonths).toBeGreaterThan(lowCac.paybackMonths);
    });

    it('higher churn decreases LTV', () => {
      const tokensPerDeck = calcTokensPerDeck(baseInputs);
      const costPerDeck = calcCostPerDeck(baseInputs, costs.routing);
      const blendedActual = calcBlendedActualDecksPerPaidUser(DEFAULT_PLANS, tokensPerDeck, baseInputs);
      const proPlusPct = calcProPlusPct(DEFAULT_PLANS);
      const blendedOverage = calcBlendedDecksPerOverageUser(DEFAULT_PLANS, tokensPerDeck, proPlusPct);

      const lowChurn = calculateEconomics(
        { ...baseInputs, churnPct: 2 },
        DEFAULT_PLANS, userBreakdown, enterprise, 100, costPerDeck, tokensPerDeck, blendedActual, blendedOverage
      );
      const highChurn = calculateEconomics(
        { ...baseInputs, churnPct: 10 },
        DEFAULT_PLANS, userBreakdown, enterprise, 100, costPerDeck, tokensPerDeck, blendedActual, blendedOverage
      );

      expect(highChurn.ltv).toBeLessThan(lowChurn.ltv);
    });

    it('changing plan prices affects ARPU', () => {
      const cheapPlans = DEFAULT_PLANS.map(p => ({ ...p, price: p.price / 2 }));
      const expensivePlans = DEFAULT_PLANS.map(p => ({ ...p, price: p.price * 2 }));

      const cheapARPU = calcBlendedARPU(cheapPlans);
      const expensiveARPU = calcBlendedARPU(expensivePlans);

      expect(expensiveARPU).toBeGreaterThan(cheapARPU);
      expect(expensiveARPU).toBe(cheapARPU * 4); // 2x price = 4x total
    });
  });
});
