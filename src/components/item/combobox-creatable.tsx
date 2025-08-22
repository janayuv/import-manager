// src/components/ui/combobox-creatable.tsx
import { Check, ChevronsUpDown, PlusCircle } from 'lucide-react'

import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { Option } from '@/types/options'

interface CreatableComboboxProps {
  options: Option[]
  value: string
  onChange: (value: string) => void
  onOptionCreate: (newOption: Option) => void
  placeholder?: string
  searchPlaceholder?: string
  notFoundText?: string
  disabled?: boolean
}

export function CreatableCombobox({
  options,
  value,
  onChange,
  onOptionCreate,
  placeholder = 'Select...',
  searchPlaceholder = 'Search or create...',
  notFoundText = 'Nothing found.',
  disabled = false,
}: CreatableComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState('')

  const selectedLabel = options.find((option) => option.value === value)?.label

  const handleCreate = () => {
    if (searchQuery) {
      // The new option's value and label are the same initially.
      // The backend is responsible for creating a canonical record.
      const newOption = { value: searchQuery, label: searchQuery }
      onOptionCreate(newOption)
      setSearchQuery('')
      setOpen(false)
    }
  }

  // Check if the current search query exactly matches an existing option's label
  const exactMatch = options.some((option) => option.label.toLowerCase() === searchQuery.toLowerCase())

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={disabled}
        >
          {selectedLabel || placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-full p-0"
        style={{ width: 'var(--radix-popover-trigger-width)' }}
      >
        <Command shouldFilter={false}>
          {' '}
          {/* We handle filtering manually to show "Create..." */}
          <CommandInput
            placeholder={searchPlaceholder}
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList>
            <CommandEmpty>
              {/* Show create option only if there's a search query and no exact match */}
              {!exactMatch && searchQuery ? (
                <CommandItem
                  onSelect={handleCreate}
                  className="flex cursor-pointer items-center gap-2"
                >
                  <PlusCircle className="h-4 w-4" />
                  Create "{searchQuery}"
                </CommandItem>
              ) : (
                <span>{notFoundText}</span>
              )}
            </CommandEmpty>
            <CommandGroup>
              {options
                .filter((option) => option.label.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => {
                      onChange(option.value)
                      setSearchQuery('')
                      setOpen(false)
                    }}
                  >
                    <Check className={cn('mr-2 h-4 w-4', value === option.value ? 'opacity-100' : 'opacity-0')} />
                    {option.label}
                  </CommandItem>
                ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
