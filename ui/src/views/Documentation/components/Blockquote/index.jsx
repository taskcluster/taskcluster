import React from 'react';
import { withStyles } from '@material-ui/core/styles';

const styles = theme => ({
  blockquote: {
    borderLeft: `5px solid ${theme.palette.text.hint}`,
    padding: `${theme.spacing(0.5)}px ${theme.spacing(3)}px`,
    margin: `${theme.spacing(3)}px 0`,
  },
});

function Blockquote({ classes, ...props }) {
  return <blockquote className={classes.blockquote} {...props} />;
}

export default withStyles(styles)(Blockquote);
