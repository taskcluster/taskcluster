import React from 'react';
import { node } from 'prop-types';
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

MarkdownTextArea.propTypes = {
  children: node.isRequired,
};

export default withStyles(styles)(MarkdownTextArea);
