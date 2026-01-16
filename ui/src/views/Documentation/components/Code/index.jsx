import React from 'react';
import { withStyles } from '@material-ui/core/styles';

const styles = theme => ({
  inlineCode: {
    ...theme.mixins.highlight,
  },
});

function Code({ classes, className, ...props }) {
  // If className contains 'language-', it's a code block (from rehype-highlight)
  // Render as plain <code> to preserve syntax highlighting classes
  const isCodeBlock = className && className.includes('language-');

  if (isCodeBlock) {
    return <code className={className} {...props} />;
  }

  // Otherwise it's inline code - apply custom styling
  return <code className={classes.inlineCode} {...props} />;
}

export default withStyles(styles)(Code);
