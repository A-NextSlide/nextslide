import React from 'react';
import { Button } from '@/components/ui/button';
import { slackIntegrationApi, type SlackStatus } from '@/services/slackIntegrationApi';

const SlackIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none">
    <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A"/>
    <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" fill="#36C5F0"/>
    <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z" fill="#2EB67D"/>
    <path d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" fill="#ECB22E"/>
  </svg>
);

export const SlackIntegrationCard: React.FC = () => {
  const [loading, setLoading] = React.useState(false);
  const [status, setStatus] = React.useState<SlackStatus | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const s = await slackIntegrationApi.getStatus();
      setStatus(s);
    } catch {
      setStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  // Listen for OAuth popup result
  React.useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'slack-oauth-result' && event.data?.success) {
        refresh();
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [refresh]);

  const handleConnect = React.useCallback(async () => {
    try {
      const url = await slackIntegrationApi.getInstallUrl();
      const w = 600;
      const h = 700;
      const left = window.screenX + (window.innerWidth - w) / 2;
      const top = window.screenY + (window.innerHeight - h) / 2;
      window.open(url, 'slack-oauth', `width=${w},height=${h},left=${left},top=${top}`);
    } catch {
      // noop
    }
  }, []);

  const handleDisconnect = React.useCallback(async () => {
    setLoading(true);
    try {
      await slackIntegrationApi.disconnect();
      await refresh();
    } catch {
      // noop
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  const renderButton = () => {
    if (loading && !status) {
      return <Button size="sm" variant="outline" disabled>Checking...</Button>;
    }
    if (status?.connected) {
      return (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleDisconnect} disabled={loading}>
            Disconnect
          </Button>
        </div>
      );
    }
    return (
      <Button size="sm" onClick={handleConnect}>
        Add to Slack
      </Button>
    );
  };

  return (
    <div className="flex items-center justify-between p-4 rounded-2xl border-2 border-black/10 dark:border-white/10">
      <div className="flex items-center gap-4">
        <div className="h-10 w-10 rounded-full bg-[#4A154B]/10 flex items-center justify-center">
          <SlackIcon className="h-5 w-5" />
        </div>
        <div>
          <p className="font-medium text-sm">Slack</p>
          <p className="text-xs text-muted-foreground">
            {status?.connected
              ? `Connected to ${status.team_name}`
              : 'Generate decks from Slack conversations'}
          </p>
        </div>
      </div>
      {renderButton()}
    </div>
  );
};

export default SlackIntegrationCard;
