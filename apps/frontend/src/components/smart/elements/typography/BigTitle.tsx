import React from 'react';
import { useSmartTheme } from '../../hooks/useSmartTheme';

interface BigTitleProps {
    text: string;
    highlight?: string;
}

export const BigTitle: React.FC<BigTitleProps> = ({ text, highlight }) => {
    const theme = useSmartTheme();

    // Simple highlight logic
    const parts = highlight ? text.split(new RegExp(`(${highlight})`, 'gi')) : [text];

    return (
        <h1 style={{
            fontSize: '4cqw',
            fontWeight: 800,
            fontFamily: theme.fonts.heading,
            lineHeight: 1.1,
            margin: 0,
            color: theme.colors.text
        }}>
            {parts.map((part, i) => (
                part.toLowerCase() === highlight?.toLowerCase() ? (
                    <span key={i} style={{ color: theme.colors.primary }}>{part}</span>
                ) : (
                    <span key={i}>{part}</span>
                )
            ))}
        </h1>
    );
};
