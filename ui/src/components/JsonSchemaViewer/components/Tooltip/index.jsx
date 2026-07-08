import React from 'react';
import { node } from 'prop-types';
import { makeStyles } from '@material-ui/core/styles';
import MuiTooltip from '@material-ui/core/Tooltip';

const useStyles = makeStyles({
  root: {
    display: 'inline',
  },
});

/**
 * Tooltip accessible by hovering mouse or touching mobile screen; this is
 * used to display chips, so its display mode is 'inline'
 */
function Tooltip({ title, children }) {
  const classes = useStyles();

  return (
    <MuiTooltip
      title={title}
      arrow
      placement="bottom-start"
      disableFocusListener
      enterTouchDelay={1}
      className={classes.root}>
      <div>{children}</div>
    </MuiTooltip>
  );
}

Tooltip.propTypes = {
  /** Keyword to display with tooltip feature */
  title: node.isRequired,
  /** Nodes for tooltip to apply and point to */
  children: node,
};

export default Tooltip;
