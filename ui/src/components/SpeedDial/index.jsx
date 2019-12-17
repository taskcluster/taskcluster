import React, { useState } from 'react';
import classNames from 'classnames';
import { arrayOf, node, oneOfType } from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import MuiSpeedDial from '@material-ui/lab/SpeedDial';
import SpeedDialIcon from '@material-ui/lab/SpeedDialIcon';
import CloseIcon from 'mdi-react/CloseIcon';
import DotsVerticalIcon from 'mdi-react/DotsVerticalIcon';

const styles = withStyles(theme => ({
  speedDial: {
    ...theme.mixins.fab,
  },
}));

/**
 * Render a dynamically expanding set of floating action buttons.
 */
function SpeedDial(props) {
  const { classes, children, className, ...rest } = props;
  const [open, setOpen] = useState(false);

  function handleClose() {
    setOpen(false);
  }

  function handleOpen() {
    setOpen(true);
  }

  return (
    <MuiSpeedDial
      ariaLabel="speed-dial"
      icon={
        <SpeedDialIcon icon={<DotsVerticalIcon />} openIcon={<CloseIcon />} />
      }
      FabProps={{ color: 'secondary' }}
      className={classNames(classes.speedDial, className)}
      onOpen={handleOpen}
      onClose={handleClose}
      open={open}
      {...rest}>
      {children}
    </MuiSpeedDial>
  );
}

SpeedDial.propTypes = {
  /**
   * A set of `SpeedDialAction`s which will be rendered upon interaction
   * with the base `SpeedDial` floating action button.
   */
  children: oneOfType([arrayOf(node), node]).isRequired,
};

export default styles(SpeedDial);
