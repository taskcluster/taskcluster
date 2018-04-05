import { Component } from 'react';
import { bool, string } from 'prop-types';
import Label from '../Label';
import labels from '../../utils/labels';

export default class StatusLabel extends Component {
  static propTypes = {
    state: string.isRequired,
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
