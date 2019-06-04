import React, { Fragment, useEffect } from 'react';
import { BrowserRouter, Switch } from 'react-router-dom';
import { withApollo } from 'react-apollo';
import { object, arrayOf } from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import RouteWithProps from '../components/RouteWithProps';
import ErrorPanel from '../components/ErrorPanel';
import { route } from '../utils/prop-types';
import { withAuth } from '../utils/Auth';
import isLoggedInQuery from './isLoggedIn.graphql';

const styles = theme => ({
  '@global': {
    [[
      'input:-webkit-autofill',
      'input:-webkit-autofill:hover',
      'input:-webkit-autofill:focus',
      'input:-webkit-autofill:active',
    ].join(',')]: {
      transition:
        'background-color 5000s ease-in-out 0s, color 5000s ease-in-out 0s',
      transitionDelay: 'background-color 5000s, color 5000s',
    },
    '.mdi-icon': {
      fill: theme.palette.text.primary,
    },
    '.CodeMirror': {
      fontSize: 13,
      height: '100% !important',
    },
    '[disabled] .mdi-icon': {
      fill: theme.palette.primary.light,
    },
    a: {
      color: theme.palette.text.primary,
    },
    'html, body': {
      color: theme.palette.text.secondary,
    },
    pre: {
      overflowX: 'auto',
    },
    ':not(pre) > code': {
      ...theme.mixins.highlight,
    },
  },
});
const Main = ({ error, routes, user, onUnauthorize, client }) => {
  useEffect(() => {
    async function loggedInQuery() {
      const { data } = await client.query({
        query: isLoggedInQuery,
        fetchPolicy: 'network-only',
      });

      if (
        user &&
        user.identityProviderId !== 'manual' &&
        data &&
        data.isLoggedIn === false
      ) {
        onUnauthorize();
      }
    }

    loggedInQuery();
  }, [])

  return (
    <Fragment>
      <ErrorPanel error={error} />
      <BrowserRouter>
        <Switch>
          {routes.map(({ routes, ...props }) => (
            <RouteWithProps key={props.path || 'not-found'} {...props} />
          ))}
        </Switch>
      </BrowserRouter>
    </Fragment>
  )
};

Main.propTypes = {
  error: object,
  routes: arrayOf(route).isRequired,
};

Main.defaultProps = {
  error: null,
};

export default withAuth(withApollo(withStyles(styles)(Main)));
