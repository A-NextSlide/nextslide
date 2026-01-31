/**
 * EnterpriseFeatureGate
 *
 * A reusable wrapper that conditionally renders enterprise features based on
 * the user's current plan.  When a feature is locked the component renders
 * either the provided `fallback` or a default lock overlay with an "Upgrade"
 * CTA.
 */

import React, { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useCredits } from '@/context/CreditsContext';
import { pqaApi, type EnterpriseFeatures } from '@/services/pqaApi';
import {
  trackEnterpriseFeatureGated,
  trackEnterpriseUpgradeClicked,
} from '@/services/analytics';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GatedFeature = 'brand_kit' | 'team_templates' | 'team_analytics';

interface EnterpriseFeatureGateProps {
  /** The enterprise feature to gate. */
  feature: GatedFeature;
  /** Content rendered when the feature is available. */
  children: React.ReactNode;
  /** Custom fallback rendered when the feature is locked. */
  fallback?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const EnterpriseFeatureGate: React.FC<EnterpriseFeatureGateProps> = ({
  feature,
  children,
  fallback,
}) => {
  const navigate = useNavigate();
  const { balance } = useCredits();

  const [featureData, setFeatureData] = useState<EnterpriseFeatures | null>(null);
  const [loading, setLoading] = useState(true);

  const currentPlan = balance?.plan_id ?? 'free';

  // Fetch enterprise features for the current plan
  useEffect(() => {
    let cancelled = false;

    const fetchFeatures = async () => {
      try {
        const data = await pqaApi.getEnterpriseFeatures();
        if (!cancelled) {
          setFeatureData(data);
        }
      } catch {
        // If the call fails, assume all enterprise features are locked
        if (!cancelled) {
          setFeatureData(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchFeatures();

    return () => {
      cancelled = true;
    };
  }, [currentPlan]);

  // While loading, show children (avoid flash-of-locked-content)
  if (loading) {
    return <>{children}</>;
  }

  // Determine if the requested feature is available
  const isAvailable = featureData?.features?.[feature] ?? false;

  if (isAvailable) {
    return <>{children}</>;
  }

  // Find the required plan for this feature
  const lockedEntry = featureData?.locked_features?.find(
    (lf) => lf.feature === feature,
  );
  const requiredPlan = lockedEntry?.required_plan ?? 'Enterprise';

  // Track that the feature gate was shown
  useEffect(() => {
    trackEnterpriseFeatureGated({ feature, currentPlan });
  }, [feature, currentPlan]);

  // Handle upgrade click
  const handleUpgradeClick = () => {
    trackEnterpriseUpgradeClicked({ feature, currentPlan });
    navigate('/pricing');
  };

  // Custom fallback
  if (fallback) {
    return <>{fallback}</>;
  }

  // Default lock overlay
  return (
    <div className="relative rounded-lg border border-dashed border-border/60 bg-muted/30 p-6 flex flex-col items-center justify-center gap-3 text-center">
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted">
        <Lock className="h-5 w-5 text-muted-foreground" />
      </div>

      <p className="text-sm text-muted-foreground">
        Available on the{' '}
        <span className="font-medium text-foreground">{requiredPlan}</span>{' '}
        plan
      </p>

      <Button size="sm" onClick={handleUpgradeClick} className="h-8 text-xs">
        Upgrade
      </Button>
    </div>
  );
};

export default EnterpriseFeatureGate;
