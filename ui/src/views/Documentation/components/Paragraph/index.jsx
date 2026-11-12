import React from 'react';
import Typography from '@mui/material/Typography';
import withStyles from '../../../../utils/withStyles';

const styles = theme => ({
  text: {
    marginBottom: theme.spacing(2),
  },
});

function Paragraph({ classes, ...props }) {
  return <Typography className={classes.text} {...props} />;
}

export default withStyles(styles)(Paragraph);
