import type { ComponentProps } from 'react';
import Label, { type LabelStatus } from '../Label';
import labels from '../../utils/labels';

export interface StatusLabelProps
  extends Omit<ComponentProps<typeof Label>, 'status' | 'children'> {
  /**
   * The state to display, e.g. a task state (`completed`) or a run
   * reason (`worker-shutdown`). Case and dashes are normalized.
   */
  state: string;
  /**
   * The label color. Only use this if you are looking to override
   * the color that's already derived from the state prop.
   */
  variant?: LabelStatus;
}

/**
 * A label color-coded based on known statuses from responses.
 */
export default function StatusLabel({
  variant,
  state,
  ...props
}: StatusLabelProps) {
  // the queue reports states and reasons in kebab case (`worker-shutdown`)
  const label = state.toUpperCase().replace(/-/g, '_');

  return (
    <Label status={variant || labels[label] || 'default'} {...props}>
      {label}
    </Label>
  );
}
