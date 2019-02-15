import React, { Component } from 'react';
import MuiMarkdown from '@mozilla-frontend-infra/components/Markdown';
import { withStyles } from '@material-ui/core/styles';

@withStyles(theme => ({
  markdown: {
    '& a, & a code': {
      // Style taken from the Link component
      color: theme.palette.secondary.main,
      textDecoration: 'none',
      '&:hover': {
        textDecoration: 'underline',
      },
    },
  },
}))
export default class Markdown extends Component {
  render() {
    const { classes, children } = this.props;

    return <MuiMarkdown className={classes.markdown}>{children}</MuiMarkdown>;
  }
}
