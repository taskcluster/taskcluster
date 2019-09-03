import React, { Component } from 'react';
import Chip from '@material-ui/core/Chip';
import { withStyles } from '@material-ui/core/styles';

@withStyles(() => ({
  chipLabel: {
    whiteSpace: 'nowrap',
    userSelect: 'text',
    cursor: 'inherit',
  },
  chipRoot: {
    whiteSpace: 'nowrap',
    userSelect: 'text',
    cursor: 'inherit',
  },
}))
export default class ChipComponent extends Component {
  render() {
    const { classes } = this.props;

    return (
      <Chip
        classes={{ label: classes.chipLabel, root: classes.chipRoot }}
        label={this.props.label}
        className={this.props.className ? this.props.className : null}
      />
    );
  }
}
