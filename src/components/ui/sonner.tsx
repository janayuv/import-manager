import { useTheme } from 'next-themes';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      position="top-right"
      expand={true}
      richColors={true}
      closeButton={true}
      duration={4000}
      style={
        {
          '--normal-bg': 'hsl(var(--popover))',
          '--normal-text': 'hsl(var(--popover-foreground))',
          '--normal-border': 'hsl(var(--border))',
          '--success-bg': 'hsl(var(--background))',
          '--success-text': 'hsl(var(--foreground))',
          '--success-border': 'hsl(142 76% 36%)',
          '--error-bg': 'hsl(var(--background))',
          '--error-text': 'hsl(var(--foreground))',
          '--error-border': 'hsl(0 84% 60%)',
          '--warning-bg': 'hsl(var(--background))',
          '--warning-text': 'hsl(var(--foreground))',
          '--warning-border': 'hsl(38 92% 50%)',
          '--info-bg': 'hsl(var(--background))',
          '--info-text': 'hsl(var(--foreground))',
          '--info-border': 'hsl(221 83% 53%)',
        } as React.CSSProperties
      }
      toastOptions={{
        style: {
          background: 'hsl(var(--background))',
          color: 'hsl(var(--foreground))',
          border: '1px solid hsl(var(--border))',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          fontSize: '14px',
          fontWeight: '400',
          lineHeight: '1.5',
        },
        classNames: {
          title: 'font-semibold text-sm',
          description: 'text-sm opacity-90 mt-1',
          actionButton:
            'bg-primary text-primary-foreground hover:bg-primary/90',
          cancelButton: 'bg-muted text-muted-foreground hover:bg-muted/80',
          closeButton: 'bg-muted text-muted-foreground hover:bg-muted/80',
          error: 'border-red-500',
          success: 'border-green-500',
          warning: 'border-yellow-500',
          info: 'border-blue-500',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
