import React from 'react';
import withStyles from '../../../../utils/withStyles';

const styles = theme => ({
  ul: {
    marginBottom: theme.spacing(2),
  },
});

function List({ classes, ...props }) {
  return <ul className={classes.ul} {...props} />;
}

export default withStyles(styles)(List);
