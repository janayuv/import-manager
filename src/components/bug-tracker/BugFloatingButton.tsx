import { Bug, List, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface BugFloatingButtonProps {
  onQuickCapture: (ev: React.MouseEvent) => void;
  onCompose: () => void;
  onOpenList: () => void;
}

export function BugFloatingButton({
  onQuickCapture,
  onCompose,
  onOpenList,
}: BugFloatingButtonProps) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col-reverse items-end gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="lg"
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-14 w-14 rounded-full shadow-lg"
            aria-label="Quick capture bug"
            onClick={onQuickCapture}
          >
            <Bug className="h-7 w-7" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          Quick capture (Shift+click to compose)
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="h-10 w-10 rounded-full shadow-md"
            aria-label="Compose bug"
            onClick={onCompose}
          >
            <Plus className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">Compose bug</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="h-10 w-10 rounded-full shadow-md"
            aria-label="Bug list"
            onClick={onOpenList}
          >
            <List className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">Bug list</TooltipContent>
      </Tooltip>
    </div>
  );
}
