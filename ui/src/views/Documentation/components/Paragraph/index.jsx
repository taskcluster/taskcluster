import React from 'react';
import Typography from '@material-ui/core/Typography';
import { withStyles } from '@material-ui/core/styles';

const styles = theme => ({
  text: {
    marginBottom: theme.spacing(2),
  },
});

function Paragraph({ classes, ...props }) {
  return <Typography className={classes.text} variant="body1" {...props} />;
}

export default withStyles(styles)(Paragraph);
