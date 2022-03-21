import React from 'react';
import { string } from 'prop-types';
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
}));
const Warning = ({ classes, children }) => (
  <Paper square classes={{ root: classes.root }}>
    <Markdown>{children}</Markdown>
  </Paper>
);

Warning.propTypes = {
  children: string.isRequired,
};

export default styles(Warning);
