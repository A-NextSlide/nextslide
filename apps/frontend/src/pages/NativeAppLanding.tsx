import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/SupabaseAuthContext';
import { BROWSER } from '@/utils/browser';

const NativeAppLanding: React.FC = () => {
  const navigate = useNavigate();
  const { user, signInWithGoogle } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Auto-redirect if signed in
  useEffect(() => {
    if (user) navigate('/app', { replace: true });
  }, [user, navigate]);

  // Entrance animation trigger
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch {
      // Auth context handles errors
    } finally {
      setGoogleLoading(false);
    }
  };

  if (user) return null;

  return (
    <div style={{
      ...styles.root,
      // iOS safe area for notch/status bar (mobile app)
      paddingTop: BROWSER.isMobileApp ? 'env(safe-area-inset-top)' : undefined,
    }}>
      {/* Draggable titlebar region — Electron only */}
      {BROWSER.isDesktopApp && <div style={styles.titlebar} />}

      {/* Ambient glow */}
      <div style={styles.glowOrb} />
      <div style={styles.glowOrbSecondary} />

      {/* Main content */}
      <div style={styles.content}>
        {/* App icon */}
        <div
          style={{
            ...styles.iconWrap,
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'scale(1)' : 'scale(0.8)',
            transition: 'opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.1s, transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s',
          }}
        >
          <img
            src="/brand/nextslide-x.png"
            alt="NextSlide"
            width={56}
            height={56}
            style={styles.icon}
          />
        </div>

        {/* Welcome heading */}
        <h1
          style={{
            ...styles.heading,
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(10px)',
            transition: 'opacity 0.6s ease 0.25s, transform 0.6s ease 0.25s',
          }}
        >
          Welcome to NextSlide
        </h1>

        {/* Subtitle */}
        <p
          style={{
            ...styles.subtitle,
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(8px)',
            transition: 'opacity 0.6s ease 0.35s, transform 0.6s ease 0.35s',
          }}
        >
          Create presentations with AI
        </p>

        {/* CTAs */}
        <div
          style={{
            ...styles.ctaGroup,
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(8px)',
            transition: 'opacity 0.5s ease 0.5s, transform 0.5s ease 0.5s',
          }}
        >
          {/* Log in — primary */}
          <button
            onClick={() => navigate('/login')}
            style={styles.primaryButton}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#e63c00';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#FF4301';
            }}
          >
            Log in
          </button>

          {/* Sign up — secondary */}
          <button
            onClick={() => navigate('/signup')}
            style={styles.secondaryButton}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
            }}
          >
            Sign up
          </button>
        </div>

        {/* Divider */}
        <div
          style={{
            ...styles.divider,
            opacity: mounted ? 1 : 0,
            transition: 'opacity 0.5s ease 0.6s',
          }}
        >
          <div style={styles.dividerLine} />
          <span style={styles.dividerText}>or</span>
          <div style={styles.dividerLine} />
        </div>

        {/* Google sign-in — tertiary */}
        <button
          onClick={handleGoogleSignIn}
          disabled={googleLoading}
          style={{
            ...styles.googleButton,
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(6px)',
            transition: 'opacity 0.5s ease 0.65s, transform 0.5s ease 0.65s, background 0.15s ease, border-color 0.15s ease',
          }}
          onMouseEnter={(e) => {
            if (!googleLoading) {
              e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
          }}
        >
          <svg width="16" height="16" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
          </svg>
          <span style={styles.googleButtonText}>
            {googleLoading ? 'Opening browser…' : 'Continue with Google'}
          </span>
        </button>

        {/* Terms/Privacy */}
        <div
          style={{
            ...styles.footer,
            opacity: mounted ? 1 : 0,
            transition: 'opacity 0.5s ease 0.8s',
          }}
        >
          <span style={styles.footerText}>
            By continuing, you agree to our{' '}
            <a href="/terms" style={styles.footerLink}>Terms</a>
            {' & '}
            <a href="/privacy" style={styles.footerLink}>Privacy Policy</a>
          </span>
        </div>
      </div>

      {/* Version badge — bottom corner */}
      <div
        style={{
          ...styles.version,
          opacity: mounted ? 1 : 0,
          transition: 'opacity 0.6s ease 0.9s',
        }}
      >
        v{BROWSER.appVersion || '1.0'}
      </div>
    </div>
  );
};

// ── Styles ──────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'fixed',
    inset: 0,
    background: '#0a0a0a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    WebkitFontSmoothing: 'antialiased',
  },

  // Electron frameless window drag region
  titlebar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '40px',
    // @ts-ignore — WebkitAppRegion is non-standard but required for Electron
    WebkitAppRegion: 'drag',
    zIndex: 10,
    pointerEvents: 'auto',
  } as React.CSSProperties,

  glowOrb: {
    position: 'absolute',
    top: '15%',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '500px',
    height: '500px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(255,67,1,0.06) 0%, rgba(255,67,1,0.015) 40%, transparent 70%)',
    pointerEvents: 'none' as const,
  },

  glowOrbSecondary: {
    position: 'absolute',
    top: '65%',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '350px',
    height: '350px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(99,67,255,0.03) 0%, transparent 60%)',
    pointerEvents: 'none' as const,
  },

  content: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    width: '100%',
    maxWidth: '300px',
    padding: '0 24px',
  },

  iconWrap: {
    marginBottom: '28px',
    width: '72px',
    height: '72px',
    borderRadius: '18px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.06)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  icon: {
    objectFit: 'contain' as const,
    display: 'block',
  },

  heading: {
    fontSize: '22px',
    fontWeight: 600,
    color: '#ffffff',
    lineHeight: 1.2,
    margin: '0 0 8px 0',
    letterSpacing: '-0.3px',
    textAlign: 'center' as const,
  },

  subtitle: {
    fontSize: '14px',
    color: 'rgba(255,255,255,0.4)',
    lineHeight: 1.4,
    margin: '0 0 36px 0',
    textAlign: 'center' as const,
  },

  ctaGroup: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
  },

  primaryButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '44px',
    borderRadius: '10px',
    border: 'none',
    background: '#FF4301',
    color: '#ffffff',
    fontSize: '15px',
    fontWeight: 600,
    letterSpacing: '0.1px',
    cursor: 'pointer',
    transition: 'background 0.15s ease',
  },

  secondaryButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '44px',
    borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.15)',
    background: 'transparent',
    color: 'rgba(255,255,255,0.85)',
    fontSize: '15px',
    fontWeight: 500,
    letterSpacing: '0.1px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },

  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    width: '100%',
    margin: '18px 0',
  },

  dividerLine: {
    flex: 1,
    height: '1px',
    background: 'rgba(255,255,255,0.06)',
  },

  dividerText: {
    fontSize: '11px',
    color: 'rgba(255,255,255,0.2)',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
    fontWeight: 500,
  },

  googleButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    width: '100%',
    height: '40px',
    borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.03)',
    cursor: 'pointer',
  },

  googleButtonText: {
    fontSize: '13px',
    fontWeight: 500,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: '0.1px',
  },

  footer: {
    marginTop: '32px',
    textAlign: 'center' as const,
    padding: '0 8px',
  },

  footerText: {
    fontSize: '11px',
    color: 'rgba(255,255,255,0.18)',
    lineHeight: 1.5,
  },

  footerLink: {
    color: 'rgba(255,255,255,0.3)',
    textDecoration: 'none',
  },

  version: {
    position: 'absolute' as const,
    bottom: '16px',
    right: '16px',
    fontSize: '10px',
    color: 'rgba(255,255,255,0.12)',
    letterSpacing: '0.3px',
    fontVariantNumeric: 'tabular-nums',
  },
};

export default NativeAppLanding;
