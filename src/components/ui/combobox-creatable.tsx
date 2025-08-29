// src/components/ui/combobox-creatable.tsx (NO CHANGE)
// A reusable combobox that allows selecting from a list or creating a new option.
import { Check, ChevronsUpDown, PlusCircle } from 'lucide-react';

import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from './command';
import { Input } from './input';
import { Label } from './label';

interface Option {
  value: string;
  label: string;
}

interface CreatableComboboxProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  onOptionCreate?: (newOption: Option) => void;
  onNameCreate?: (name: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  dialogTitle?: string;
  dialogDescription?: string;
}

export function CreatableCombobox({
  options,
  value,
  onChange,
  onOptionCreate,
  onNameCreate,
  placeholder = 'Select an option...',
  searchPlaceholder = 'Search...',
  emptyText = 'No results found.',
  dialogTitle = 'Create New',
  dialogDescription = 'Enter the details for the new option.',
}: CreatableComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [newOptionLabel, setNewOptionLabel] = React.useState('');

  const handleCreateNew = () => {
    if (newOptionLabel) {
      if (onNameCreate) {
        onNameCreate(newOptionLabel);
      } else if (onOptionCreate) {
        const newOption = {
          value: newOptionLabel.toLowerCase().replace(/\s/g, '-'),
          label: newOptionLabel,
        };
        onOptionCreate(newOption);
        onChange(newOption.value);
      }
      setDialogOpen(false);
      setNewOptionLabel('');
      setOpen(false);
    }
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            {value
              ? options.find(option => option.value === value)?.label
              : placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>
                <div className="p-4 text-sm">{emptyText}</div>
              </CommandEmpty>
              <CommandGroup>
                {options.map(option => (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === option.value ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    setDialogOpen(true);
                  }}
                >
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Create New
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="new-option-label" className="text-right">
              Label
            </Label>
            <Input
              id="new-option-label"
              value={newOptionLabel}
              onChange={e => setNewOptionLabel(e.target.value)}
              className="col-span-3"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleCreateNew}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
