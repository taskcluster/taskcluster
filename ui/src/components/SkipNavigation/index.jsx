import React, { Component } from 'react';
import { Typography } from '@material-ui/core';
import Link from '../../utils/Link';

export default class SkipNavigation extends Component {
  render() {
    const { href, text } = this.props;

    return (
      <Link to={href}>
        <Typography>{text}</Typography>
      </Link>
    );
  }
}
