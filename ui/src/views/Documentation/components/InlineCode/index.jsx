import React from 'react';
import { withStyles } from '@material-ui/core/styles';

const useStyles = withStyles(theme => ({
  inlineCode: {
    ...theme.mixins.highlight,
  },
}));

function InlineCode({ classes, ...props }) {
  return <code className={classes.inlineCode} {...props} />;
}

export default useStyles(InlineCode);
