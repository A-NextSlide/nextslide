import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import {
  shouldShowInstallBanner,
  dismissInstallBanner,
  getAppStoreUrl,
} from "@/utils/nativeGrowth";
import { nativeBridge } from "@/utils/nativeBridge";

/**
 * Smart app install banner shown to mobile web users.
 * Promotes installing the native app for a better experience.
 * Auto-hides in native apps and respects dismiss cooldowns.
 */
export function AppInstallBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Delay check to avoid layout shift on page load
    const timer = setTimeout(() => {
      setVisible(shouldShowInstallBanner());
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  const handleDismiss = () => {
    dismissInstallBanner();
    setVisible(false);
  };

  const handleInstall = () => {
    nativeBridge.openExternal(getAppStoreUrl());
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        padding: "12px 16px",
        background: "#0A0A0A",
        borderTop: "1px solid #1E1E1E",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        animation: "slideUp 0.3s ease-out",
      }}
    >
      {/* App icon */}
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: "#000",
          border: "1px solid #1E1E1E",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <svg width={24} height={24} viewBox="0 0 64 64">
          <line x1="12" y1="12" x2="52" y2="52" stroke="#FF4301" strokeWidth="8" strokeLinecap="round" />
          <line x1="52" y1="12" x2="12" y2="52" stroke="#FF4301" strokeWidth="8" strokeLinecap="round" />
        </svg>
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            color: "#fff",
            fontSize: 14,
            fontWeight: 700,
            lineHeight: "18px",
          }}
        >
          NextSlide App
        </div>
        <div
          style={{
            color: "#999",
            fontSize: 12,
            lineHeight: "16px",
          }}
        >
          Faster, offline, push notifications
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={handleInstall}
        style={{
          background: "#FF4301",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "8px 16px",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        GET
      </button>

      {/* Dismiss */}
      <button
        onClick={handleDismiss}
        style={{
          background: "transparent",
          border: "none",
          color: "#666",
          cursor: "pointer",
          padding: 4,
          flexShrink: 0,
          display: "flex",
        }}
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
