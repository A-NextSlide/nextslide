import React from 'react';
import { motion } from 'framer-motion';
import { useSmartTheme } from '../../hooks/useSmartTheme';

interface StatCardProps {
    label: string;
    value: string;
    trend?: string;
    trendDirection?: 'up' | 'down' | 'neutral';
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, trend, trendDirection = 'neutral' }) => {
    const theme = useSmartTheme();

    const getTrendColor = () => {
        if (trendDirection === 'up') return '#10B981'; // Green
        if (trendDirection === 'down') return '#EF4444'; // Red
        return theme.colors.text;
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            style={{
                backgroundColor: theme.colors.background, // Or a slightly lighter/darker shade?
                border: `1px solid ${theme.colors.muted}`,
                borderRadius: theme.borderRadius.lg,
                padding: theme.spacing.lg,
                boxShadow: theme.shadows.md,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                minWidth: '200px'
            }}
        >
            <span style={{
                fontSize: '16px',
                color: theme.colors.muted,
                fontFamily: theme.fonts.body,
                marginBottom: theme.spacing.xs
            }}>
                {label}
            </span>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: theme.spacing.sm }}>
                <span style={{
                    fontSize: '48px',
                    fontWeight: 700,
                    color: theme.colors.primary,
                    fontFamily: theme.fonts.heading
                }}>
                    {value}
                </span>

                {trend && (
                    <span style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: getTrendColor(),
                        backgroundColor: getTrendColor() + '20',
                        padding: '4px 8px',
                        borderRadius: '12px'
                    }}>
                        {trend}
                    </span>
                )}
            </div>
        </motion.div>
    );
};
