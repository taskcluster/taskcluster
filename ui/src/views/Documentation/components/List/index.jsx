import React from 'react';
import { withStyles } from '@material-ui/core/styles';

const styles = theme => ({
  ul: {
    marginBottom: theme.spacing(2),
  },
});

function List({ classes, ...props }) {
  return <ul className={classes.ul} {...props} />;
}

export default withStyles(styles)(List);
