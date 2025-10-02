import React, { useEffect, useMemo, useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface TemporaryPasswordGateProps {
  children: React.ReactNode;
  password?: string;
  enabled?: boolean;
}

// Simple, easily removable gate. Uses localStorage to persist unlock across sessions.
const STORAGE_KEY = 'ns_temp_gate_unlocked_v1';

export const TemporaryPasswordGate: React.FC<TemporaryPasswordGateProps> = ({
  children,
  password = 'NextBeta',
  enabled = true,
}) => {
  const { currentTheme } = useTheme();
  const [value, setValue] = useState('');
  const [unlocked, setUnlocked] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [showThanks, setShowThanks] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (unlocked) {
      try {
        localStorage.setItem(STORAGE_KEY, 'true');
      } catch {}
    }
  }, [unlocked]);

  const onSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!value) {
      setError('Enter password');
      return;
    }
    if (value === password) {
      setError(null);
      setShowThanks(true);
      setTimeout(() => setUnlocked(true), 800);
    } else {
      setError('Incorrect password');
    }
  };

  const brandStyles = useMemo(() => ({
    background: currentTheme?.background || '#fff',
    color: currentTheme?.text || '#111',
    accent: currentTheme?.accent1 || '#111',
  }), [currentTheme]);

  if (!enabled || unlocked) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6" style={{ backgroundColor: brandStyles.background }}>
      <Card className="w-full max-w-md" style={{ borderColor: brandStyles.accent }}>
        <CardHeader>
          <div className="flex items-center justify-center mb-2">
            <img src="/brand/nextslide-x.png" alt="NextSlide" className="h-10" />
          </div>
          <CardTitle className="text-center" style={{ color: brandStyles.color }}>Beta Access</CardTitle>
          <CardDescription className="text-center">Enter the beta password to continue</CardDescription>
        </CardHeader>
        <CardContent>
          {showThanks ? (
            <div className="text-center py-6">
              <div className="text-lg font-medium" style={{ color: brandStyles.color }}>Thanks for joining the beta!</div>
              <div className="text-sm text-muted-foreground mt-1">Unlocking access…</div>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-3">
              <Input
                type="password"
                placeholder="Password"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
              />
              {error ? (
                <div className="text-sm text-red-500">{error}</div>
              ) : null}
              <Button type="submit" className="w-full">Enter</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TemporaryPasswordGate;


