import React, { Component } from 'react';
import withStyles from '../../utils/withStyles';
import Spinner from '../Spinner';

@withStyles(theme => ({
  spinner: {
    marginTop: theme.spacing(3),
  },
}))
export default class Loading extends Component {
  render() {
    const { classes, ...props } = this.props;

    return <Spinner loading className={classes.spinner} {...props} />;
  }
}
