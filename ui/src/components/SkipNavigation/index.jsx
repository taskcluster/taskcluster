import React, { Component } from 'react';
import { Typography, Button, withStyles } from '@material-ui/core';

@withStyles(theme => ({
  skipButton: {
    position: 'absolute',
    left: '-2000px',
    tabindex: '0',
    height: theme.spacing.quad * 2,
    '&:focus': {
      position: 'absolute',
      left: 0,
      top: 0,
      background: theme.palette.error.main,
      'z-index': '100',
    },
  },
}))
export default class SkipNavigation extends Component {
  render() {
    const { classes, text, onClick } = this.props;

    return (
      <Button className={classes.skipButton} onClick={onClick}>
        <Typography>{text}</Typography>
      </Button>
    );
  }
}
