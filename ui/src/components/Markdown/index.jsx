import React from 'react';
import { node } from 'prop-types';
import MuiMarkdown from '@mozilla-frontend-infra/components/Markdown';
import { withStyles } from '@material-ui/core/styles';

const styles = theme => ({
  markdown: {
    '& a': {
      ...theme.mixins.link,
    },
  },
});

function Markdown({ classes, ...props }) {
  return <MuiMarkdown className={classes.markdown} {...props} />;
}

Markdown.propTypes = {
  children: node.isRequired,
};

export default withStyles(styles)(Markdown);
