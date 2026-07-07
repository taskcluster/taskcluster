import React from 'react';
import { node } from 'prop-types';
import { alpha, withStyles } from '@material-ui/core/styles';
import Paper from '@material-ui/core/Paper';

const styles = withStyles(theme => ({
  root: {
    borderLeft: `5px solid ${theme.palette.warning.dark}`,
    backgroundColor: alpha(theme.palette.warning.main, 0.2),
    padding: `${theme.spacing(1)}px ${theme.spacing(3)}px`,
    margin: `${theme.spacing(3)}px 0`,
    '& > :first-child': {
      marginTop: 0,
    },
    '& > :last-child': {
      marginBottom: 0,
    },
    '& a': {
      ...theme.mixins.link,
    },
  },
}));
const Warning = ({ classes, children }) => (
  <Paper square classes={{ root: classes.root }}>
    {children}
  </Paper>
);

Warning.propTypes = {
  children: node.isRequired,
};

export default styles(Warning);
