import React, { Component } from 'react';
import { Typography, Button, withStyles } from '@material-ui/core';

@withStyles(theme => ({
  skipButton: {
    position: 'absolute',
    left: '-2000px',
    '&:focus': {
      position: 'absolute',
      left: theme.spacing.triple * 3,
    },
  },
}))
export default class SkipNavigation extends Component {
  render() {
    const { classes, text } = this.props;

    return (
      <Button className={classes.skipButton}>
        <Typography>{text}</Typography>
      </Button>
    );
  }
}
