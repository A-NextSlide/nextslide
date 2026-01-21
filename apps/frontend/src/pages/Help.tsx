import { useEffect } from 'react';

// Use custom domain once DNS propagates, fallback to default for now
const CHATBASE_HELP_URL = import.meta.env.VITE_CHATBASE_DOMAIN
  ? `https://${import.meta.env.VITE_CHATBASE_DOMAIN}/help`
  : 'https://www.chatbase.co/lO1UjxyTYHy5jrGi9Fjnz/help';

export default function Help() {
  useEffect(() => {
    window.location.href = CHATBASE_HELP_URL;
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-muted-foreground">Redirecting to help center...</p>
    </div>
  );
}
