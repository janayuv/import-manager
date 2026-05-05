import { CreatableCombobox } from '@/components/ui/combobox-creatable';
import { Label } from '@/components/ui/label';

import {
  type ContextField,
  type SuggestionOption,
  pushContextCache,
} from '@/components/bug-tracker/context-suggestions';
import type { BugContext } from '@/types/bug-note';

export interface ContextSelectorOptions {
  module: SuggestionOption[];
  page: SuggestionOption[];
  component: SuggestionOption[];
  function: SuggestionOption[];
}

interface ContextSelectorProps {
  value: BugContext;
  onChange: (next: BugContext) => void;
  options: ContextSelectorOptions;
}

function Field({
  field,
  label,
  options,
  comboboxValue,
  onValueChange,
}: {
  field: ContextField;
  label: string;
  options: SuggestionOption[];
  comboboxValue: string;
  onValueChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label className="text-muted-foreground text-xs">{label}</Label>
      <CreatableCombobox
        options={options}
        value={comboboxValue}
        onChange={onValueChange}
        onNameCreate={name => {
          pushContextCache(field, name);
          onValueChange(name);
        }}
        placeholder={`${label}…`}
        searchPlaceholder={`Search ${label.toLowerCase()}…`}
        emptyText={`No ${label.toLowerCase()} found.`}
        dialogTitle={`New ${label}`}
        dialogDescription={`Add a custom ${label.toLowerCase()} value.`}
      />
    </div>
  );
}

export function ContextSelector({
  value,
  onChange,
  options,
}: ContextSelectorProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field
        field="module"
        label="Module"
        options={options.module}
        comboboxValue={value.module ?? ''}
        onValueChange={v => onChange({ ...value, module: v || undefined })}
      />
      <Field
        field="page"
        label="Page"
        options={options.page}
        comboboxValue={value.page ?? ''}
        onValueChange={v => onChange({ ...value, page: v || undefined })}
      />
      <Field
        field="component"
        label="Component"
        options={options.component}
        comboboxValue={value.component ?? ''}
        onValueChange={v => onChange({ ...value, component: v || undefined })}
      />
      <Field
        field="function"
        label="Function"
        options={options.function}
        comboboxValue={value.function ?? ''}
        onValueChange={v => onChange({ ...value, function: v || undefined })}
      />
    </div>
  );
}
