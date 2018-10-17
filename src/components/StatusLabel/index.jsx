import React, { Component } from 'react';
import { bool, string } from 'prop-types';
import Label from '@mozilla-frontend-infra/components/Label';
import labels from '../../utils/labels';

/**
 * A label color-coded based on known statuses from GraphQL responses.
 */
export default class StatusLabel extends Component {
  static defaultProps = {
    mini: true,
    className: null,
  };

  static propTypes = {
    /**
     * A GraphQL status/state string.
     */
    state: string.isRequired,
    /**
     * Render the label using dense styling.
     */
    mini: bool,
    /** The CSS class name of the wrapper element */
    className: string,
  };

  render() {
    const { state, mini, className } = this.props;

    return (
      <Label
        mini={mini}
        status={labels[state] || 'default'}
        className={className}
      >
        {state || 'UNKNOWN'}
      </Label>
    );
  }
}
