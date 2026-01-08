import React from 'react';
import Typography from '@material-ui/core/Typography';
import { withStyles } from '@material-ui/core/styles';

const styles = theme => ({
  text: {
    marginBottom: theme.spacing(2),
  },
});

function Paragraph({ classes, ...props }) {
  return <Typography variant="body1" className={classes.text} {...props} />;
}

export default withStyles(styles)(Paragraph);
