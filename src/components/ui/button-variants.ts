import { cva } from 'class-variance-authority';

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 active:bg-primary/80',
        accent:
          'bg-accent text-accent-foreground shadow-xs hover:bg-accent/90 active:bg-accent/80 focus-visible:ring-accent/20 dark:focus-visible:ring-accent/40',
        destructive:
          'bg-destructive text-white shadow-xs hover:bg-destructive/90 active:bg-destructive/80 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        success:
          'bg-success text-success-foreground shadow-xs hover:bg-success/90 active:bg-success/80 focus-visible:ring-success/20 dark:focus-visible:ring-success/40',
        warning:
          'bg-warning text-warning-foreground shadow-xs hover:bg-warning/90 active:bg-warning/80 focus-visible:ring-warning/20 dark:focus-visible:ring-warning/40',
        info: 'bg-info text-info-foreground shadow-xs hover:bg-info/90 active:bg-info/80 focus-visible:ring-info/20 dark:focus-visible:ring-info/40',
        neutral:
          'bg-neutral text-neutral-foreground shadow-xs hover:bg-neutral/90 active:bg-neutral/80 focus-visible:ring-neutral/20 dark:focus-visible:ring-neutral/40',
        outline:
          'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50',
        'outline-accent':
          'border-accent text-accent shadow-xs hover:bg-accent hover:text-accent-foreground active:bg-accent/80 active:text-accent-foreground focus-visible:ring-accent/20 dark:focus-visible:ring-accent/40',
        secondary:
          'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80 active:bg-secondary/70',
        ghost:
          'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
        'ghost-accent':
          'text-accent hover:bg-accent hover:text-accent-foreground active:bg-accent/80 active:text-accent-foreground focus-visible:ring-accent/20 dark:focus-visible:ring-accent/40',
        link: 'text-primary underline-offset-4 hover:underline',
        'link-accent': 'text-accent underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);
