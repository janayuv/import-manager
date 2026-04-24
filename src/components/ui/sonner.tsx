import { useTheme } from 'next-themes';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group pointer-events-auto"
      position="top-right"
      expand
      richColors
      closeButton
      duration={4000}
      toastOptions={{
        classNames: {
          toast:
            '!border !border-border !shadow-lg !opacity-100 !backdrop-blur-none ' +
            '!bg-popover !text-popover-foreground',
          title: '!text-popover-foreground font-semibold text-sm',
          description: '!text-popover-foreground/95 mt-1 text-sm',
          actionButton:
            '!bg-primary !text-primary-foreground hover:!bg-primary/90',
          cancelButton: '!bg-muted !text-muted-foreground hover:!bg-muted/90',
          closeButton:
            '!border-0 !bg-muted/80 !text-foreground hover:!bg-muted',
          // Solid surfaces so text never sits on transparent / page chrome (e.g. over accent buttons)
          success:
            '!border !border-emerald-800/90 !bg-emerald-950 !text-emerald-50 ' +
            '[&_[data-description]]:!text-emerald-100/95',
          error:
            '!border !border-red-800/90 !bg-red-950 !text-red-50 ' +
            '[&_[data-description]]:!text-red-100/95',
          warning:
            '!border !border-amber-800/90 !bg-amber-950 !text-amber-50 ' +
            '[&_[data-description]]:!text-amber-100/95',
          info:
            '!border !border-sky-800/90 !bg-sky-950 !text-sky-50 ' +
            '[&_[data-description]]:!text-sky-100/95',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
