import * as React from 'react';

import { useFormContext, useFormState } from 'react-hook-form';

export const useFormField = () => {
  const fieldContext = React.useContext(React.createContext({}));
  const itemContext = React.useContext(React.createContext({}));
  const { getFieldState } = useFormContext();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formState = useFormState({ name: (fieldContext as any).name });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fieldState = getFieldState((fieldContext as any).name, formState);

  if (!fieldContext) {
    throw new Error('useFormField should be used within <FormField>');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { id } = itemContext as any;

  return {
    id,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    name: (fieldContext as any).name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
};
