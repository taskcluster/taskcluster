import React, { Component } from 'react';
import classNames from 'classnames';
import { arrayOf, node, oneOfType } from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import MuiSpeedDial from '@material-ui/lab/SpeedDial';
import SpeedDialIcon from '@material-ui/lab/SpeedDialIcon';
import CloseIcon from 'mdi-react/CloseIcon';
import DotsVerticalIcon from 'mdi-react/DotsVerticalIcon';

@withStyles(theme => ({
  speedDial: {
    ...theme.mixins.fab,
  },
}))
/**
 * Render a dynamically expanding set of floating action buttons.
 */
export default class SpeedDial extends Component {
  static propTypes = {
    /**
     * A set of `SpeedDialAction`s which will be rendered upon interaction
     * with the base `SpeedDial` floating action button.
     */
    children: oneOfType([arrayOf(node), node]).isRequired,
  };

  state = {
    open: false,
  };

  handleClose = (_, reason) => {
    if (reason === 'toggle' || reason === 'blur') {
      this.setState({
        open: false,
      });
    }
  };

  handleOpen = (_, reason) => {
    if (reason === 'toggle') {
      this.setState({
        open: true,
      });
    }
  };

  render() {
    const { classes, children, className, ...props } = this.props;
    const { open } = this.state;

    return (
      <MuiSpeedDial
        ariaLabel="speed-dial"
        icon={
          <SpeedDialIcon icon={<DotsVerticalIcon />} openIcon={<CloseIcon />} />
        }
        FabProps={{ color: 'secondary' }}
        className={classNames(classes.speedDial, className)}
        onOpen={this.handleOpen}
        onClose={this.handleClose}
        open={open}
        {...props}>
        {children}
      </MuiSpeedDial>
    );
  }
}
