import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useSmartTheme } from '../../hooks/useSmartTheme';

interface SmartImageProps {
    src: string;
    alt?: string;
    caption?: string;
    aspectRatio?: string; // CSS aspect-ratio value
}

export const SmartImage: React.FC<SmartImageProps> = ({ src, alt, caption, aspectRatio = '16/9' }) => {
    const theme = useSmartTheme();
    const [isLoaded, setIsLoaded] = useState(false);

    return (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
            <div style={{
                position: 'relative',
                width: '100%',
                aspectRatio: aspectRatio,
                borderRadius: theme.borderRadius.md,
                overflow: 'hidden',
                backgroundColor: theme.colors.muted // Placeholder color
            }}>
                {!isLoaded && (
                    <motion.div
                        initial={{ opacity: 0.5 }}
                        animate={{ opacity: 1 }}
                        transition={{ repeat: Infinity, duration: 1, repeatType: "reverse" }}
                        style={{
                            width: '100%',
                            height: '100%',
                            backgroundColor: theme.colors.muted
                        }}
                    />
                )}
                <motion.img
                    src={src}
                    alt={alt || 'Slide image'}
                    initial={{ opacity: 0, scale: 1.05 }}
                    animate={{ opacity: isLoaded ? 1 : 0, scale: isLoaded ? 1 : 1.05 }}
                    transition={{ duration: 0.7 }}
                    onLoad={() => setIsLoaded(true)}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        position: 'absolute',
                        top: 0,
                        left: 0
                    }}
                />
            </div>

            {caption && (
                <span style={{
                    fontSize: '14px',
                    color: theme.colors.muted,
                    fontFamily: theme.fonts.body,
                    fontStyle: 'italic',
                    textAlign: 'center'
                }}>
                    {caption}
                </span>
            )}
        </div>
    );
};
