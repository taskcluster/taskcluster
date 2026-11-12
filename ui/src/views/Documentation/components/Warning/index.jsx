import React from 'react';
import { node } from 'prop-types';
import { alpha } from '@mui/material/styles';
import withStyles from '@mui/styles/withStyles';
import Paper from '@mui/material/Paper';
import { FIRST_CHILD } from '../../../../utils/constants';

const styles = withStyles(theme => ({
  root: {
    borderLeft: `5px solid ${theme.palette.warning.dark}`,
    backgroundColor: alpha(theme.palette.warning.main, 0.2),
    padding: `${theme.spacing(1)} ${theme.spacing(3)}`,
    margin: `${theme.spacing(3)} 0`,
    [`& > ${FIRST_CHILD}`]: {
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
