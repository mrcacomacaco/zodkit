/**
 * @fileoverview Type declarations for ink packages without official types
 */

declare module 'ink-text-input' {
  import { FC } from 'react';

  export interface TextInputProps {
    value?: string;
    placeholder?: string;
    focus?: boolean;
    mask?: string;
    highlightPastedText?: boolean;
    showCursor?: boolean;
    onChange?: (value: string) => void;
    onSubmit?: (value: string) => void;
  }

  const TextInput: FC<TextInputProps>;
  export default TextInput;
}

declare module 'ink-select-input' {
  import { FC } from 'react';

  export interface Item<T = any> {
    label: string;
    value: T;
  }

  export interface SelectInputProps<T = any> {
    items?: Array<Item<T>>;
    isFocused?: boolean;
    initialIndex?: number;
    limit?: number;
    indicatorComponent?: FC<{ isSelected: boolean }>;
    itemComponent?: FC<{ isSelected: boolean; label: string }>;
    onSelect?: (item: Item<T>) => void;
    onHighlight?: (item: Item<T>) => void;
  }

  const SelectInput: FC<SelectInputProps>;
  export default SelectInput;
}
