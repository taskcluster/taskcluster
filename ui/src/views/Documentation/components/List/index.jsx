import React from 'react';
import { withStyles } from '@material-ui/core/styles';

const useStyles = withStyles(theme => ({
  ul: {
    marginBottom: theme.spacing.double,
  },
}));

function List({ classes, ...props }) {
  return <ul className={classes.ul} {...props} />;
}

export default useStyles(List);
