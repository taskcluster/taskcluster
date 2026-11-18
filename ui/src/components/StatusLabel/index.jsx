import React, { Component } from 'react';
import { oneOf, string } from 'prop-types';
import Label from '../Label';
import labels from '../../utils/labels';

/**
 * A label color-coded based on known statuses from responses.
 */
export default class StatusLabel extends Component {
  static defaultProps = {
    variant: null,
  };

  static propTypes = {
    /**
     * The state to display, e.g. a task state (`completed`) or a run
     * reason (`worker-shutdown`). Case and dashes are normalized.
     */
    state: string.isRequired,
    /** The CSS class name of the wrapper element */
    className: string,
    /**
     * The label color. Only use this if you are looking to override
     * the color that's already derived from the state prop.
     * */
    variant: oneOf(['default', 'info', 'success', 'error', 'warning']),
  };

  render() {
    const { variant, state, ...props } = this.props;
    // the queue reports states and reasons in kebab case (`worker-shutdown`)
    const label = state ? state.toUpperCase().replace(/-/g, '_') : 'UNKNOWN';

    return (
      <Label status={variant || labels[label] || 'default'} {...props}>
        {label}
      </Label>
    );
  }
}
