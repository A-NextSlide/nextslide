import React, { useState } from "react";
import { Bell, Smartphone, Mail, Monitor } from "lucide-react";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreference,
  type NotificationChannel,
} from "@/types/notifications";

type Props = {
  preferences?: NotificationPreference[];
  onSave?: (preferences: NotificationPreference[]) => void;
};

/**
 * Admin panel section for managing notification preferences.
 * Renders a channel-by-channel toggle grid (push / email / in-app).
 */
export function NotificationSettings({
  preferences: initialPrefs,
  onSave,
}: Props) {
  const [preferences, setPreferences] = useState<NotificationPreference[]>(
    initialPrefs ?? DEFAULT_NOTIFICATION_PREFERENCES
  );
  const [dirty, setDirty] = useState(false);

  const toggle = (
    channel: NotificationChannel,
    field: "push" | "email" | "inApp"
  ) => {
    setPreferences((prev) =>
      prev.map((p) =>
        p.channel === channel ? { ...p, [field]: !p[field] } : p
      )
    );
    setDirty(true);
  };

  const handleSave = () => {
    onSave?.(preferences);
    setDirty(false);
  };

  const categories = [
    { key: "activity" as const, label: "Activity" },
    { key: "social" as const, label: "Social" },
    { key: "marketing" as const, label: "Marketing" },
  ];

  return (
    <div style={{ padding: "24px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
        <Bell size={20} style={{ color: "#FF4301" }} />
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
          Notification Preferences
        </h3>
      </div>

      {categories.map(({ key, label }) => {
        const items = preferences.filter((p) => p.category === key);
        if (items.length === 0) return null;

        return (
          <div key={key} style={{ marginBottom: 24 }}>
            <div
              style={{
                color: "#999",
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "1px",
                marginBottom: 12,
                paddingBottom: 8,
                borderBottom: "1px solid #1E1E1E",
              }}
            >
              {label}
            </div>

            {items.map((pref) => (
              <div
                key={pref.channel}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 0",
                  borderBottom: "1px solid #0A0A0A",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ color: "#fff", fontSize: 14, fontWeight: 500 }}>
                    {pref.label}
                  </div>
                  <div style={{ color: "#666", fontSize: 12, marginTop: 2 }}>
                    {pref.description}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 16 }}>
                  <ToggleButton
                    icon={<Smartphone size={14} />}
                    label="Push"
                    active={pref.push}
                    onClick={() => toggle(pref.channel, "push")}
                  />
                  <ToggleButton
                    icon={<Mail size={14} />}
                    label="Email"
                    active={pref.email}
                    onClick={() => toggle(pref.channel, "email")}
                  />
                  <ToggleButton
                    icon={<Monitor size={14} />}
                    label="In-App"
                    active={pref.inApp}
                    onClick={() => toggle(pref.channel, "inApp")}
                  />
                </div>
              </div>
            ))}
          </div>
        );
      })}

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
          Save Preferences
        </button>
      )}
    </div>
  );
}

function ToggleButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 8px",
        borderRadius: 6,
        border: `1px solid ${active ? "#FF4301" : "#1E1E1E"}`,
        background: active ? "rgba(255, 67, 1, 0.1)" : "transparent",
        color: active ? "#FF4301" : "#666",
        cursor: "pointer",
        fontSize: 11,
        fontWeight: 500,
        transition: "all 0.15s ease",
      }}
    >
      {icon}
      {label}
    </button>
  );
}
