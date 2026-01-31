import React from 'react';
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
}) => {
    return (
        <div
            className={cn(
                "bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-xl p-2.5",
                className
            )}
        >
            <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-[#888] flex items-center gap-1">
                    <Icon className="w-3 h-3" />
                    {title}
                </span>
                {trend && trendValue && (
                    <span className={cn(
                        "text-[10px] font-medium",
                        trend === 'up' ? "text-emerald-500" :
                            trend === 'down' ? "text-red-500" :
                                "text-[#888]"
                    )}>
                        {trendValue}
                    </span>
                )}
            </div>
            <div className="text-lg font-semibold tabular-nums leading-tight">
                {value}
            </div>
            {subValue && (
                <p className="text-[10px] text-[#999] mt-0.5">
                    {subValue}
                </p>
            )}
        </div>
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
        <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
                <h1 className="text-base font-semibold">{title}</h1>
                {description && (
                    <p className="text-xs text-[#666] dark:text-[#888]">
                        {description}
                    </p>
                )}
            </div>
            <div className="flex items-center gap-1.5">
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
}) => {
    return (
        <Link
            to={to}
            className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-xl p-3 hover:border-[#FF4301]/40 dark:hover:border-[#FF4301]/40 transition-colors group"
        >
            <div className="flex items-start justify-between">
                <div>
                    <Icon className="h-4 w-4 mb-2 text-[#666] dark:text-[#888] group-hover:text-[#FF4301] transition-colors" />
                    <h3 className="text-xs font-medium">{title}</h3>
                    <p className="text-[10px] text-[#888] mt-0.5">{description}</p>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-[#888] group-hover:text-[#333] dark:group-hover:text-white transition-colors" />
            </div>
        </Link>
    );
};
