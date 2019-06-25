import React, { Component } from 'react';
import { bool, string } from 'prop-types';
import Vnc from 'react-vnc-display';
import withAlertOnClose from '../../utils/withAlertOnClose';

@withAlertOnClose
export default class VncDisplay extends Component {
  static defaultProps = {
    shared: false,
    viewOnly: false,
  };

  static propTypes = {
    url: string.isRequired,
    shared: bool,
    viewOnly: bool,
  };

  render() {
    return (
      <Vnc
        url={this.props.url}
        view_only={this.props.viewOnly}
        shared={this.props.shared}
      />
    );
  }
}
