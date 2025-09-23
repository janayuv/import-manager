import { Slot } from '@radix-ui/react-slot';
import { type VariantProps } from 'class-variance-authority';

import * as React from 'react';

import { cn } from '@/lib/utils';
import { useTheme } from '@/components/layout/theme-context';

import { badgeVariants } from './badge-variants';

function Badge({
  className,
  variant,
  asChild = false,
  useAccentColor = false,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { 
    asChild?: boolean;
    useAccentColor?: boolean;
  }) {
  const { theme } = useTheme();
  const Comp = asChild ? Slot : 'span';

  const getAccentVariant = (currentVariant: VariantProps<typeof badgeVariants>['variant']): VariantProps<typeof badgeVariants>['variant'] => {
    if (!useAccentColor) return currentVariant;

    switch (currentVariant) {
      case 'default':
        return 'accent';
      case 'outline':
        return 'outline'; // Keep outline as is since it already uses accent colors
      default:
        return currentVariant;
    }
  };

  const finalVariant = getAccentVariant(variant);

  return (
    <Comp
      data-slot="badge"
      data-theme-color={theme.color}
      className={cn(badgeVariants({ variant: finalVariant }), className)}
      {...props}
    />
  );
}

export { Badge };
