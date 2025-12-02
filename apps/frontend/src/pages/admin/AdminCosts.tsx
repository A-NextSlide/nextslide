import React, { useState, useEffect } from 'react';
import AdminLayoutV2 from '@/components/admin/AdminLayoutV2';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, Loader2, Calculator } from 'lucide-react';
import { adminApi, CostEstimateResponse } from '@/services/adminApi';

const AdminCosts: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [estimateData, setEstimateData] = useState<CostEstimateResponse | null>(null);
  const [decksPerDay, setDecksPerDay] = useState(10);
  const [slidesPerDeck, setSlidesPerDeck] = useState(10);

  const loadData = async () => {
    setLoading(true);
    try {
      const estimate = await adminApi.getCostEstimate(decksPerDay, slidesPerDeck);
      setEstimateData(estimate);
    } catch (err) {
      console.error('Error loading costs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      adminApi.getCostEstimate(decksPerDay, slidesPerDeck).then(setEstimateData);
    }, 300);
    return () => clearTimeout(timer);
  }, [decksPerDay, slidesPerDeck]);

  if (loading) {
    return (
      <AdminLayoutV2>
        <div className="p-6 flex items-center justify-center h-[60vh]">
          <Loader2 className="h-5 w-5 animate-spin text-[#666]" />
        </div>
      </AdminLayoutV2>
    );
  }

  return (
    <AdminLayoutV2>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Cost Estimator</h1>
            <p className="text-xs text-[#666] dark:text-[#888]">
              Estimate monthly API costs based on usage
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={loadData} className="h-8 text-xs">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>

        {/* Calculator */}
        <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#eaeaea] dark:divide-[#333]">
            {/* Inputs */}
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-2 text-xs text-[#666] dark:text-[#888] mb-3">
                <Calculator className="h-3.5 w-3.5" />
                <span className="font-medium">Parameters</span>
              </div>
              <div>
                <label className="text-xs text-[#666] dark:text-[#888] block mb-1.5">
                  Decks per day
                </label>
                <Input
                  type="number"
                  value={decksPerDay}
                  onChange={(e) => setDecksPerDay(Math.max(1, Number(e.target.value) || 1))}
                  min={1}
                  max={1000}
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-[#666] dark:text-[#888] block mb-1.5">
                  Slides per deck
                </label>
                <Input
                  type="number"
                  value={slidesPerDeck}
                  onChange={(e) => setSlidesPerDeck(Math.max(1, Number(e.target.value) || 1))}
                  min={1}
                  max={100}
                  className="h-9 text-sm"
                />
              </div>
              <div className="pt-2 text-xs text-[#999] dark:text-[#666]">
                {(decksPerDay * 30).toLocaleString()} decks/mo
                <br />
                {(decksPerDay * 30 * slidesPerDeck).toLocaleString()} slides/mo
              </div>
            </div>

            {/* Result */}
            <div className="p-5 flex flex-col items-center justify-center bg-[#fafafa] dark:bg-[#0a0a0a]">
              <span className="text-xs text-[#666] dark:text-[#888] mb-1">Estimated Monthly</span>
              <span className="text-4xl font-semibold tracking-tight">
                ${estimateData?.total_monthly_usd.toFixed(2) || '0.00'}
              </span>
              <span className="text-xs text-[#999] dark:text-[#666] mt-2">
                ~${((estimateData?.total_monthly_usd || 0) / 30).toFixed(2)}/day
              </span>
            </div>

            {/* By Provider */}
            <div className="p-5">
              <div className="text-xs text-[#666] dark:text-[#888] mb-3 font-medium">By Provider</div>
              <div className="space-y-2">
                {estimateData?.by_provider && Object.entries(estimateData.by_provider)
                  .sort(([, a], [, b]) => b - a)
                  .map(([provider, cost]) => (
                    <div key={provider} className="flex items-center justify-between">
                      <span className="text-sm capitalize text-[#666] dark:text-[#888]">{provider}</span>
                      <span className="text-sm font-medium font-mono">${cost.toFixed(2)}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>

        {/* Breakdown */}
        {estimateData?.breakdown && estimateData.breakdown.length > 0 && (
          <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-[#eaeaea] dark:border-[#333]">
              <span className="text-sm font-medium">Cost Breakdown</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#eaeaea] dark:border-[#333] text-xs text-[#666] dark:text-[#888]">
                    <th className="text-left px-4 py-2.5 font-medium">Operation</th>
                    <th className="text-left px-4 py-2.5 font-medium">Model</th>
                    <th className="text-right px-4 py-2.5 font-medium">Calls/mo</th>
                    <th className="text-right px-4 py-2.5 font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {estimateData.breakdown.map((item, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-[#eaeaea] dark:border-[#333] last:border-0 hover:bg-[#fafafa] dark:hover:bg-[#0a0a0a]"
                    >
                      <td className="px-4 py-2.5">{item.operation}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-[#666] dark:text-[#888]">
                        {item.model}
                      </td>
                      <td className="px-4 py-2.5 text-right text-[#666] dark:text-[#888] tabular-nums">
                        {item.calls_per_month.toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium font-mono tabular-nums">
                        ${item.cost_usd.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AdminLayoutV2>
  );
};

export default AdminCosts;
