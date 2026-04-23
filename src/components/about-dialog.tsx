import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type AboutDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AboutDialog({ open, onOpenChange }: AboutDialogProps) {
  const version = import.meta.env.VITE_APP_VERSION ?? '—';
  const buildTime = import.meta.env.VITE_BUILD_TIME ?? '—';
  const git = import.meta.env.VITE_GIT_COMMIT ?? 'dev';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Import Manager</DialogTitle>
          <DialogDescription>Application information</DialogDescription>
        </DialogHeader>
        <dl className="grid gap-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Version</dt>
            <dd className="font-mono">{version}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Build time</dt>
            <dd className="break-all font-mono">{buildTime}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Git commit</dt>
            <dd className="font-mono">{git}</dd>
          </div>
        </dl>
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
