import React from 'react';
import { node, element } from 'prop-types';
import { makeStyles } from '@material-ui/core/styles';
import MuiChip from '@material-ui/core/Chip';

const useStyles = makeStyles(theme => ({
  /**
   * Chips used for keyword notations.
   */
  chip: {
    color: theme.palette.text.primary,
    borderColor: theme.palette.text.secondary,
  },
}));

function Chip({ label, icon }) {
  /**
   * Generate classes to use styles for chips.
   */
  const classes = useStyles();

  return (
    <MuiChip
      className={classes.chip}
      label={label}
      icon={icon}
      size="small"
      variant="outlined"
    />
  );
}

Chip.propTypes = {
  /** Label for chip to display */
  label: node.isRequired,
  /** Icon for chip to display */
  icon: element,
};

Chip.defaultProps = {
  icon: null,
};

export default React.memo(Chip);
