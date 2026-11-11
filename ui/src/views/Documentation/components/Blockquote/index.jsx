import React from 'react';
import withStyles from '@mui/styles/withStyles';

const styles = theme => ({
  blockquote: {
    borderLeft: `5px solid ${theme.palette.text.hint}`,
    padding: `${theme.spacing(0.5)} ${theme.spacing(3)}`,
    margin: `${theme.spacing(3)} 0`,
  },
});

function Blockquote({ classes, ...props }) {
  return <blockquote className={classes.blockquote} {...props} />;
}

export default withStyles(styles)(Blockquote);
