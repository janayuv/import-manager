import React from 'react';
import { cn } from '@/lib/utils';

// Responsive scaling props interface
interface ResponsiveProps {
  size?: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl';
  className?: string;
  children?: React.ReactNode;
}

// Responsive Text Component
export const ResponsiveText: React.FC<ResponsiveProps> = ({
  size = 'base',
  className,
  children,
}) => {
  const sizeClasses = {
    xs: 'text-fluid-xs',
    sm: 'text-fluid-sm',
    base: 'text-fluid-base',
    lg: 'text-fluid-lg',
    xl: 'text-fluid-xl',
    '2xl': 'text-fluid-2xl',
    '3xl': 'text-fluid-3xl',
  };

  return <span className={cn(sizeClasses[size], className)}>{children}</span>;
};

// Responsive Button Component
interface ResponsiveButtonProps extends ResponsiveProps {
  variant?: 'default' | 'sm' | 'lg';
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
}

export const ResponsiveButton: React.FC<ResponsiveButtonProps> = ({
  size = 'base',
  variant = 'default',
  className,
  children,
  onClick,
  disabled = false,
  type = 'button',
  ...props
}) => {
  const variantClasses = {
    default: 'btn-fluid',
    sm: 'btn-fluid-sm',
    lg: 'btn-fluid-lg',
  };

  const sizeClasses = {
    xs: 'text-fluid-xs',
    sm: 'text-fluid-sm',
    base: 'text-fluid-base',
    lg: 'text-fluid-lg',
    xl: 'text-fluid-xl',
    '2xl': 'text-fluid-2xl',
    '3xl': 'text-fluid-3xl',
  };

  return (
    <button
      type={type}
      className={cn(
        variantClasses[variant],
        sizeClasses[size],
        'focus-visible:ring-ring ring-offset-background inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
        className
      )}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};

// Responsive Input Component
interface ResponsiveInputProps extends ResponsiveProps {
  variant?: 'default' | 'sm' | 'lg';
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  disabled?: boolean;
}

export const ResponsiveInput: React.FC<ResponsiveInputProps> = ({
  size = 'base',
  variant = 'default',
  className,
  placeholder,
  value,
  onChange,
  type = 'text',
  disabled = false,
  ...props
}) => {
  const variantClasses = {
    default: 'input-fluid',
    sm: 'input-fluid-sm',
    lg: 'input-fluid-lg',
  };

  const sizeClasses = {
    xs: 'text-fluid-xs',
    sm: 'text-fluid-sm',
    base: 'text-fluid-base',
    lg: 'text-fluid-lg',
    xl: 'text-fluid-xl',
    '2xl': 'text-fluid-2xl',
    '3xl': 'text-fluid-3xl',
  };

  return (
    <input
      type={type}
      className={cn(
        variantClasses[variant],
        sizeClasses[size],
        'border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex w-full rounded-md border px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      disabled={disabled}
      {...props}
    />
  );
};

// Responsive Table Component
interface ResponsiveTableProps extends ResponsiveProps {
  children: React.ReactNode;
  variant?: 'default' | 'compact' | 'auto';
  container?: boolean;
}

export const ResponsiveTable: React.FC<ResponsiveTableProps> = ({
  size = 'base',
  variant = 'default',
  container = true,
  className,
  children,
}) => {
  const sizeClasses = {
    xs: 'text-fluid-xs',
    sm: 'text-fluid-sm',
    base: 'text-fluid-base',
    lg: 'text-fluid-lg',
    xl: 'text-fluid-xl',
    '2xl': 'text-fluid-2xl',
    '3xl': 'text-fluid-3xl',
  };

  const variantClasses = {
    default: 'table-fluid',
    compact: 'table-fluid-compact',
    auto: 'table-fluid-auto',
  };

  const tableElement = (
    <table
      className={cn(variantClasses[variant], sizeClasses[size], className)}
    >
      {children}
    </table>
  );

  if (container) {
    return (
      <div className="table-container-fluid">
        <div className="table-wrapper-fluid">{tableElement}</div>
      </div>
    );
  }

  return tableElement;
};

// Responsive Card Component
interface ResponsiveCardProps extends ResponsiveProps {
  variant?: 'default' | 'sm' | 'lg';
  children: React.ReactNode;
}

export const ResponsiveCard: React.FC<ResponsiveCardProps> = ({
  size = 'base',
  variant = 'default',
  className,
  children,
}) => {
  const variantClasses = {
    default: 'card-fluid',
    sm: 'card-fluid-sm',
    lg: 'card-fluid-lg',
  };

  const sizeClasses = {
    xs: 'text-fluid-xs',
    sm: 'text-fluid-sm',
    base: 'text-fluid-base',
    lg: 'text-fluid-lg',
    xl: 'text-fluid-xl',
    '2xl': 'text-fluid-2xl',
    '3xl': 'text-fluid-3xl',
  };

  return (
    <div
      className={cn(
        variantClasses[variant],
        sizeClasses[size],
        'bg-card text-card-foreground rounded-lg border shadow-sm',
        className
      )}
    >
      {children}
    </div>
  );
};

// Responsive Icon Component
interface ResponsiveIconProps extends ResponsiveProps {
  variant?: 'default' | 'sm' | 'lg' | 'xl';
  children: React.ReactNode;
}

export const ResponsiveIcon: React.FC<ResponsiveIconProps> = ({
  variant = 'default',
  className,
  children,
}) => {
  const variantClasses = {
    default: 'icon-fluid',
    sm: 'icon-fluid-sm',
    lg: 'icon-fluid-lg',
    xl: 'icon-fluid-xl',
  };

  return (
    <div className={cn(variantClasses[variant], className)}>{children}</div>
  );
};

// Responsive Container Component
interface ResponsiveContainerProps extends ResponsiveProps {
  variant?: 'default' | 'sm' | 'lg' | 'xl';
  children: React.ReactNode;
}

export const ResponsiveContainer: React.FC<ResponsiveContainerProps> = ({
  size = 'base',
  variant = 'default',
  className,
  children,
}) => {
  const variantClasses = {
    default: 'p-fluid',
    sm: 'p-fluid-sm',
    lg: 'p-fluid-lg',
    xl: 'p-fluid-xl',
  };

  const sizeClasses = {
    xs: 'text-fluid-xs',
    sm: 'text-fluid-sm',
    base: 'text-fluid-base',
    lg: 'text-fluid-lg',
    xl: 'text-fluid-xl',
    '2xl': 'text-fluid-2xl',
    '3xl': 'text-fluid-3xl',
  };

  return (
    <div className={cn(variantClasses[variant], sizeClasses[size], className)}>
      {children}
    </div>
  );
};

// Responsive Grid Component
interface ResponsiveGridProps extends ResponsiveProps {
  variant?: 'default' | 'sm' | 'lg';
  children: React.ReactNode;
}

export const ResponsiveGrid: React.FC<ResponsiveGridProps> = ({
  size = 'base',
  variant = 'default',
  className,
  children,
}) => {
  const variantClasses = {
    default: 'grid-fluid',
    sm: 'grid-fluid-sm',
    lg: 'grid-fluid-lg',
  };

  const sizeClasses = {
    xs: 'text-fluid-xs',
    sm: 'text-fluid-sm',
    base: 'text-fluid-base',
    lg: 'text-fluid-lg',
    xl: 'text-fluid-xl',
    '2xl': 'text-fluid-2xl',
    '3xl': 'text-fluid-3xl',
  };

  return (
    <div
      className={cn(
        'grid',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
    >
      {children}
    </div>
  );
};

// Responsive Spacing Component
interface ResponsiveSpacingProps extends ResponsiveProps {
  variant?: 'default' | 'sm' | 'lg' | 'xl';
  children: React.ReactNode;
}

export const ResponsiveSpacing: React.FC<ResponsiveSpacingProps> = ({
  size = 'base',
  variant = 'default',
  className,
  children,
}) => {
  const variantClasses = {
    default: 'space-fluid',
    sm: 'space-fluid-sm',
    lg: 'space-fluid-lg',
    xl: 'space-fluid-xl',
  };

  const sizeClasses = {
    xs: 'text-fluid-xs',
    sm: 'text-fluid-sm',
    base: 'text-fluid-base',
    lg: 'text-fluid-lg',
    xl: 'text-fluid-xl',
    '2xl': 'text-fluid-2xl',
    '3xl': 'text-fluid-3xl',
  };

  return (
    <div
      className={cn(
        'flex',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
    >
      {children}
    </div>
  );
};
