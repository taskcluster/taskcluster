import React from 'react';
import { node } from 'prop-types';
import MuiMarkdown from '@mozilla-frontend-infra/components/Markdown';
import { withStyles } from '@material-ui/core/styles';

const useStyles = withStyles(theme => ({
  markdown: {
    '& a, & a code': {
      ...theme.mixins.link,
    },
  },
}));

function Markdown({ classes, ...props }) {
  return <MuiMarkdown className={classes.markdown} {...props} />;
}

Markdown.propTypes = {
  children: node.isRequired,
};

export default useStyles(Markdown);
