import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ArrowRight, LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

// --- Stat Card ---

interface StatCardProps {
    title: string;
    value: string | number;
    subValue?: string;
    icon: LucideIcon;
    trend?: 'up' | 'down' | 'neutral';
    trendValue?: string;
    className?: string;
    delay?: number;
}

export const StatCard: React.FC<StatCardProps> = ({
    title,
    value,
    subValue,
    icon: Icon,
    trend,
    trendValue,
    className,
    delay = 0
}) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay }}
            className={cn(
                "relative overflow-hidden rounded-2xl p-6",
                "bg-white dark:bg-zinc-900/50",
                "border border-zinc-200 dark:border-zinc-800",
                "hover:border-zinc-300 dark:hover:border-zinc-700",
                "transition-all duration-300 group",
                className
            )}
        >
            <div className="flex items-start justify-between mb-4">
                <div className="p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 group-hover:bg-[#FF4301]/10 group-hover:text-[#FF4301] transition-colors duration-300">
                    <Icon className="w-5 h-5" />
                </div>
                {trend && trendValue && (
                    <div className={cn(
                        "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full",
                        trend === 'up' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                            trend === 'down' ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400" :
                                "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                    )}>
                        <span>{trendValue}</span>
                    </div>
                )}
            </div>

            <div className="space-y-1">
                <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{title}</h3>
                <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">
                        {value}
                    </span>
                </div>
                {subValue && (
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                        {subValue}
                    </p>
                )}
            </div>

            {/* Decorative gradient blob */}
            <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-gradient-to-br from-[#FF4301]/5 to-transparent rounded-full blur-2xl group-hover:from-[#FF4301]/10 transition-all duration-500" />
        </motion.div>
    );
};

// --- Dashboard Header ---

interface DashboardHeaderProps {
    title: string;
    description?: string;
    children?: React.ReactNode;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
    title,
    description,
    children
}) => {
    return (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white font-['HK_Grotesk_Wide']">
                    {title}
                </h1>
                {description && (
                    <p className="text-zinc-500 dark:text-zinc-400 mt-1">
                        {description}
                    </p>
                )}
            </div>
            <div className="flex items-center gap-2">
                {children}
            </div>
        </div>
    );
};

// --- Quick Action Card ---

interface QuickActionCardProps {
    title: string;
    description: string;
    icon: LucideIcon;
    to: string;
    delay?: number;
}

export const QuickActionCard: React.FC<QuickActionCardProps> = ({
    title,
    description,
    icon: Icon,
    to,
    delay = 0
}) => {
    return (
        <Link to={to}>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay }}
                className={cn(
                    "h-full p-6 rounded-2xl",
                    "bg-white dark:bg-zinc-900/30",
                    "border border-zinc-200 dark:border-zinc-800",
                    "hover:border-[#FF4301]/30 dark:hover:border-[#FF4301]/30",
                    "hover:bg-zinc-50 dark:hover:bg-zinc-900/60",
                    "transition-all duration-300 group cursor-pointer"
                )}
            >
                <div className="flex items-center justify-between mb-4">
                    <div className="p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 group-hover:bg-[#FF4301] group-hover:text-white transition-colors duration-300">
                        <Icon className="w-6 h-6" />
                    </div>
                    <ArrowRight className="w-5 h-5 text-zinc-400 group-hover:text-[#FF4301] group-hover:translate-x-1 transition-all duration-300" />
                </div>
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">
                    {title}
                </h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    {description}
                </p>
            </motion.div>
        </Link>
    );
};
