import { Component } from 'react';
import { bool, string } from 'prop-types';
import Label from '@mozilla-frontend-infra/components/Label';
import labels from '../../utils/labels';

/**
 * A label color-coded based on known statuses from GraphQL responses.
 */
export default class StatusLabel extends Component {
  static propTypes = {
    /**
     * A GraphQL status/state string.
     */
    state: string.isRequired,
    /**
     * Render the label using dense styling.
     */
    mini: bool,
  };

  static defaultProps = {
    mini: true,
  };

  render() {
    const { state, mini } = this.props;

    return (
      <Label mini={mini} status={labels[state] || 'default'}>
        {state || 'UNKNOWN'}
      </Label>
    );
  }
}
