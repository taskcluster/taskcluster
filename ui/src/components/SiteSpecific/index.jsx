import React, { createContext } from 'react';
import { arrayOf, node, string } from 'prop-types';
import { alpha, withStyles } from '@material-ui/core/styles';
import Paper from '@material-ui/core/Paper';
import {
  siteSpecificVariables,
  substituteSiteSpecific,
} from '../../utils/siteSpecific';

export const SiteSpecificContext = createContext(null);

const styles = withStyles(theme => ({
  root: {
    borderLeft: `5px solid ${theme.palette.specific.dark}`,
    backgroundColor: alpha(theme.palette.specific.main, 0.2),
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

const SiteSpecific = ({ classes, requires, showIfNotSet, children }) => {
  const variables = siteSpecificVariables();

  if (requires?.some(v => !variables[v])) {
    return null;
  }

  if (showIfNotSet?.every(v => variables[v])) {
    return null;
  }

  return (
    <SiteSpecificContext.Provider
      value={text => substituteSiteSpecific(text, variables)}>
      <Paper square classes={{ root: classes.root }}>
        {children}
      </Paper>
    </SiteSpecificContext.Provider>
  );
};

SiteSpecific.propTypes = {
  requires: arrayOf(string),
  showIfNotSet: arrayOf(string),
  children: node.isRequired,
};

export default styles(SiteSpecific);

export const SiteLink = ({ name, path = '', children }) => {
  const value = siteSpecificVariables()[name];

  if (!value) {
    return null;
  }

  const href = `${value}${path}`;

  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children || href}
    </a>
  );
};

SiteLink.propTypes = {
  name: string.isRequired,
  path: string,
  children: node,
};
