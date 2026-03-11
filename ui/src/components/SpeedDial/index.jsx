import React, { useState, useRef, useEffect } from 'react';
import classNames from 'classnames';
import { arrayOf, node, oneOfType } from 'prop-types';
import { withRouter } from 'react-router-dom';
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
  const { classes, children, className, location, ...rest } = props;
  const [open, setOpen] = useState(false);
  const timeout = useRef(null);

  function resetTimeout() {
    if (timeout.current) {
      clearTimeout(timeout.current);
      timeout.current = null;
    }
  }

  // hide upon navigation
  useEffect(() => {
    return () => {
      resetTimeout();
      setOpen(false);
    };
  }, []);

  useEffect(() => {
    resetTimeout();
    setOpen(false);
  }, [location.pathname]);

  function handleClose(evt) {
    if (evt.type === 'click') {
      setOpen(false);
    } else {
      resetTimeout();
      timeout.current = setTimeout(() => setOpen(false), 4000);
    }
  }

  function handleOpen() {
    resetTimeout();
    setOpen(true);
  }

  function handleMouseEnter() {
    resetTimeout();
  }

  function handleMouseLeave() {
    if (open) {
      timeout.current = setTimeout(() => setOpen(false), 4000);
    }
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
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
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

export default withRouter(styles(SpeedDial));
