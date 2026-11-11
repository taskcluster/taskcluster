import React from 'react';
import withStyles from '@mui/styles/withStyles';

const styles = theme => ({
  ul: {
    marginBottom: theme.spacing(2),
  },
});

function List({ classes, ...props }) {
  return <ul className={classes.ul} {...props} />;
}

export default withStyles(styles)(List);
