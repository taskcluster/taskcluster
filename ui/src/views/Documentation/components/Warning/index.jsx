import React from 'react';
import { node } from 'prop-types';
import { alpha, withStyles } from '@material-ui/core/styles';
import Paper from '@material-ui/core/Paper';
import Markdown from '../../../../components/Markdown';

const styles = withStyles(theme => ({
  root: {
    borderLeft: `5px solid ${theme.palette.warning.dark}`,
    backgroundColor: alpha(theme.palette.warning.main, 0.2),
    padding: `${theme.spacing(1)}px ${theme.spacing(3)}px`,
    margin: `${theme.spacing(3)}px 0`,
    '& a': {
      ...theme.mixins.link,
    },
  },
  content: {
    fontFamily: theme.typography.fontFamily,
    fontSize: '1em',
    color: theme.palette.text.primary,
    '& p': {
      margin: 0,
      lineHeight: 1.6,
    },
    '& code': {
      display: 'inline-block',
      lineHeight: 1.6,
      fontFamily: 'Consolas, "Liberation Mono", Menlo, Courier, monospace',
      padding: '3px 6px',
      fontSize: '0.875em',
      backgroundColor:
        theme.palette.type === 'dark' ? alpha('#fff', 0.1) : alpha('#000', 0.1),
    },
    '& a': {
      ...theme.mixins.link,
    },
  },
}));
const Warning = ({ classes, children }) => {
  // Check if children is a string (needs markdown parsing)
  // or React element (already compiled by MDX)
  const isString = typeof children === 'string';

  return (
    <Paper square classes={{ root: classes.root }}>
      {isString ? (
        <Markdown>{children}</Markdown>
      ) : (
        <div className={classes.content}>{children}</div>
      )}
    </Paper>
  );
};

Warning.propTypes = {
  children: node.isRequired,
};

export default styles(Warning);
