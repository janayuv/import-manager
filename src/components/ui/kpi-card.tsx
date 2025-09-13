import { ArrowDownIcon, ArrowUpIcon, MinusIcon } from '@radix-ui/react-icons';

import type { ComponentType } from 'react';

import { cn } from '@/lib/utils';

interface KPICardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  trend?: {
    value: number;
    isPositive: boolean;
    period: string;
  };
  variant?: 'default' | 'success' | 'warning' | 'destructive';
  className?: string;
  loading?: boolean;
}

export function KPICard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  variant = 'default',
  className,
  loading = false,
}: KPICardProps) {
  const getVariantStyles = () => {
    switch (variant) {
      case 'success':
        return 'border-success/20 bg-success/5 dark:border-success/80 dark:bg-success/20';
      case 'warning':
        return 'border-warning/20 bg-warning/5 dark:border-warning/80 dark:bg-warning/20';
      case 'destructive':
        return 'border-destructive/20 bg-destructive/5 dark:border-destructive/80 dark:bg-destructive/20';
      default:
        return 'border-border bg-card';
    }
  };

  const getIconColor = () => {
    switch (variant) {
      case 'success':
        return 'text-green-600 dark:text-green-400';
      case 'warning':
        return 'text-warning';
      case 'destructive':
        return 'text-destructive';
      default:
        return 'text-muted-foreground';
    }
  };

  const getTrendIcon = () => {
    if (!trend) return null;

    if (trend.value === 0) {
      return <MinusIcon className="text-muted-foreground h-4 w-4" />;
    }

    return trend.isPositive ? (
      <ArrowUpIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
    ) : (
      <ArrowDownIcon className="text-destructive h-4 w-4" />
    );
  };

  const getTrendColor = () => {
    if (!trend) return '';

    if (trend.value === 0) return 'text-muted-foreground';
    return trend.isPositive ? 'text-success' : 'text-destructive';
  };

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border p-6 transition-all duration-200 hover:shadow-md',
        getVariantStyles(),
        className
      )}
    >
      {/* Background pattern */}
      <div className="to-muted/20 absolute inset-0 bg-gradient-to-br from-transparent via-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

      <div className="relative flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-muted-foreground text-sm font-medium">{title}</p>

          {loading ? (
            <div className="bg-muted h-8 w-20 animate-pulse rounded" />
          ) : (
            <p className="text-2xl font-bold tracking-tight">
              {typeof value === 'number' ? value.toLocaleString() : value}
            </p>
          )}

          {description && (
            <p className="text-muted-foreground text-xs">{description}</p>
          )}

          {trend && (
            <div className="flex items-center gap-1 text-xs">
              {getTrendIcon()}
              <span className={cn('font-medium', getTrendColor())}>
                {Math.abs(trend.value)}%
              </span>
              <span className="text-muted-foreground">vs {trend.period}</span>
            </div>
          )}
        </div>

        {Icon && (
          <div
            className={cn(
              'bg-muted/50 group-hover:bg-muted flex h-12 w-12 items-center justify-center rounded-lg transition-colors duration-200',
              getIconColor()
            )}
          >
            <Icon className="h-6 w-6" />
          </div>
        )}
      </div>
    </div>
  );
}

// Specialized KPI card variants
export function MetricCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  className,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ComponentType<{ className?: string }>;
  trend?: { value: number; isPositive: boolean };
  className?: string;
}) {
  return (
    <KPICard
      title={title}
      value={value}
      description={subtitle}
      icon={icon}
      trend={trend ? { ...trend, period: 'last month' } : undefined}
      className={className}
    />
  );
}

export function StatCard({
  title,
  value,
  icon,
  className,
}: {
  title: string;
  value: string | number;
  icon?: ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <KPICard title={title} value={value} icon={icon} className={className} />
  );
}
