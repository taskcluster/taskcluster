import React from 'react';
import { withStyles } from '@material-ui/core/styles';

const styles = theme => ({
  inlineCode: {
    ...theme.mixins.highlight,
  },
});

function InlineCode({ classes, ...props }) {
  return <code className={classes.inlineCode} {...props} />;
}

export default withStyles(styles)(InlineCode);
