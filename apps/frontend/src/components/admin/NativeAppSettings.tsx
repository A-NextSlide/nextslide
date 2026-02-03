import React, { useState } from "react";
import { Smartphone, Monitor, Download, Star, Bell, BarChart3 } from "lucide-react";

type NativeAppConfig = {
  installBannerEnabled: boolean;
  installBannerCooldownDays: number;
  ratingPromptEnabled: boolean;
  ratingPromptThreshold: number;
  notificationPromptEnabled: boolean;
  notificationPromptDelay: number;
  desktopAutoUpdateEnabled: boolean;
  deepLinksEnabled: boolean;
};

const DEFAULT_CONFIG: NativeAppConfig = {
  installBannerEnabled: true,
  installBannerCooldownDays: 14,
  ratingPromptEnabled: true,
  ratingPromptThreshold: 5,
  notificationPromptEnabled: true,
  notificationPromptDelay: 2,
  desktopAutoUpdateEnabled: true,
  deepLinksEnabled: true,
};

type Props = {
  config?: NativeAppConfig;
  onSave?: (config: NativeAppConfig) => void;
};

/**
 * Admin panel section for configuring native app growth settings.
 * Controls install banners, rating prompts, notification timing, etc.
 */
export function NativeAppSettings({ config: initialConfig, onSave }: Props) {
  const [config, setConfig] = useState<NativeAppConfig>(initialConfig ?? DEFAULT_CONFIG);
  const [dirty, setDirty] = useState(false);

  const update = <K extends keyof NativeAppConfig>(key: K, value: NativeAppConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = () => {
    onSave?.(config);
    setDirty(false);
  };

  return (
    <div style={{ padding: "24px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
        <Smartphone size={20} style={{ color: "#FF4301" }} />
        <h3
          style={{
            color: "#fff",
            fontSize: 16,
            fontWeight: 700,
            margin: 0,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
          }}
        >
          Native App Settings
        </h3>
      </div>

      {/* Install Banner */}
      <SettingsSection
        icon={<Download size={16} />}
        title="App Install Banner"
        description="Promote native app to mobile web users"
      >
        <ToggleRow
          label="Enable install banner"
          checked={config.installBannerEnabled}
          onChange={(v) => update("installBannerEnabled", v)}
        />
        <NumberRow
          label="Cooldown (days)"
          value={config.installBannerCooldownDays}
          min={1}
          max={90}
          onChange={(v) => update("installBannerCooldownDays", v)}
        />
      </SettingsSection>

      {/* Rating Prompt */}
      <SettingsSection
        icon={<Star size={16} />}
        title="Rating Prompt"
        description="Prompt users to rate the app"
      >
        <ToggleRow
          label="Enable rating prompt"
          checked={config.ratingPromptEnabled}
          onChange={(v) => update("ratingPromptEnabled", v)}
        />
        <NumberRow
          label="Show after N decks created"
          value={config.ratingPromptThreshold}
          min={1}
          max={50}
          onChange={(v) => update("ratingPromptThreshold", v)}
        />
      </SettingsSection>

      {/* Notification Prompt */}
      <SettingsSection
        icon={<Bell size={16} />}
        title="Notification Permission"
        description="When to ask for push notification permissions"
      >
        <ToggleRow
          label="Enable prompt"
          checked={config.notificationPromptEnabled}
          onChange={(v) => update("notificationPromptEnabled", v)}
        />
        <NumberRow
          label="Delay until N decks created"
          value={config.notificationPromptDelay}
          min={0}
          max={20}
          onChange={(v) => update("notificationPromptDelay", v)}
        />
      </SettingsSection>

      {/* Desktop */}
      <SettingsSection
        icon={<Monitor size={16} />}
        title="Desktop App"
        description="Desktop-specific settings"
      >
        <ToggleRow
          label="Auto-update enabled"
          checked={config.desktopAutoUpdateEnabled}
          onChange={(v) => update("desktopAutoUpdateEnabled", v)}
        />
        <ToggleRow
          label="Deep links (nextslide://)"
          checked={config.deepLinksEnabled}
          onChange={(v) => update("deepLinksEnabled", v)}
        />
      </SettingsSection>

      {dirty && (
        <button
          onClick={handleSave}
          style={{
            background: "#FF4301",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "10px 24px",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            marginTop: 8,
          }}
        >
          Save Settings
        </button>
      )}
    </div>
  );
}

// ---- Sub-components ----

function SettingsSection({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        marginBottom: 24,
        padding: 16,
        background: "#0A0A0A",
        borderRadius: 10,
        border: "1px solid #1E1E1E",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ color: "#FF4301" }}>{icon}</span>
        <span style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>{title}</span>
      </div>
      <div style={{ color: "#666", fontSize: 12, marginBottom: 16 }}>{description}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ color: "#ccc", fontSize: 13 }}>{label}</span>
      <button
        onClick={() => onChange(!checked)}
        style={{
          width: 40,
          height: 22,
          borderRadius: 11,
          border: "none",
          cursor: "pointer",
          background: checked ? "#FF4301" : "#333",
          position: "relative",
          transition: "background 0.2s ease",
        }}
      >
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: 8,
            background: "#fff",
            position: "absolute",
            top: 3,
            left: checked ? 21 : 3,
            transition: "left 0.2s ease",
          }}
        />
      </button>
    </div>
  );
}

function NumberRow({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ color: "#ccc", fontSize: 13 }}>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || min)}
        style={{
          width: 64,
          padding: "4px 8px",
          borderRadius: 6,
          border: "1px solid #1E1E1E",
          background: "#141414",
          color: "#fff",
          fontSize: 13,
          textAlign: "center",
        }}
      />
    </div>
  );
}
