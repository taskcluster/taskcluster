import React from 'react';
import MuiMarkdownTextArea from '@mozilla-frontend-infra/components/MarkdownTextArea';
import { withStyles } from '@material-ui/core/styles';

const styles = theme => ({
  markdown: {
    '& a': {
      ...theme.mixins.link,
    },
  },
});

function MarkdownTextArea({ classes, ...props }) {
  return (
    <MuiMarkdownTextArea
      classes={{ markdownContainer: classes.markdown }}
      {...props}
    />
  );
}

export default withStyles(styles)(MarkdownTextArea);
