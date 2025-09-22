import { Slot } from '@radix-ui/react-slot';
import { type VariantProps } from 'class-variance-authority';

import * as React from 'react';

import { cn } from '@/lib/utils';
import { useTheme } from '@/components/layout/theme-context';

import { buttonVariants } from './button-variants';

interface ButtonProps
  extends React.ComponentProps<'button'>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  useAccentColor?: boolean;
}

function Button({
  className,
  variant,
  size,
  asChild = false,
  useAccentColor = false,
  ...props
}: ButtonProps) {
  const { theme } = useTheme();
  const Comp = asChild ? Slot : 'button';

  // Auto-convert certain variants to accent variants when useAccentColor is true
  const getAccentVariant = (
    currentVariant: VariantProps<typeof buttonVariants>['variant']
  ): VariantProps<typeof buttonVariants>['variant'] => {
    if (!useAccentColor) return currentVariant;

    switch (currentVariant) {
      case 'default':
        return 'accent';
      case 'outline':
        return 'outline-accent';
      case 'ghost':
        return 'ghost-accent';
      case 'link':
        return 'link-accent';
      default:
        return currentVariant;
    }
  };

  const finalVariant = getAccentVariant(variant);

  return (
    <Comp
      data-slot="button"
      data-theme-color={theme.color}
      className={cn(buttonVariants({ variant: finalVariant, size, className }))}
      {...props}
    />
  );
}

export { Button, type ButtonProps };
