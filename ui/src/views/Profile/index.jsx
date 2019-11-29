import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { graphql } from 'react-apollo';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Typography from '@material-ui/core/Typography';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import { withStyles } from '@material-ui/core/styles';
import Dashboard from '../../components/Dashboard';
import DateDistance from '../../components/DateDistance';
import { withAuth } from '../../utils/Auth';
import ErrorPanel from '../../components/ErrorPanel';
import profileQuery from './profile.graphql';

@hot(module)
@withAuth
@graphql(profileQuery, {
  skip: ({ user }) => !user,
  options: () => ({
    fetchPolicy: 'network-only',
  }),
})
@withStyles({
  certificate: {
    wordBreak: 'break-word',
  },
})
export default class Profile extends Component {
  render() {
    const {
      user,
      classes,
      data: { currentScopes, loading, error } = {},
    } = this.props;

    return (
      <Dashboard title="Profile">
        {!currentScopes && loading && <Spinner loading />}
        <ErrorPanel fixed error={error} />
        {!user && !loading && (
          <Typography variant="subtitle1">
            Sign in to view your profile
          </Typography>
        )}
        {user && currentScopes && (
          <Fragment>
            <Typography variant="subtitle1">Credential Information</Typography>
            <List>
              <ListItem>
                <ListItemText
                  primary="Signed In As"
                  secondary={user.profile.displayName}
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Certificate"
                  secondary={
                    user.credentials.certificate ? (
                      <code className={classes.certificate}>
                        {user.credentials.certificate}
                      </code>
                    ) : (
                      'n/a'
                    )
                  }
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Client ID"
                  secondary={<code>{user.credentials.clientId}</code>}
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Expires"
                  secondary={<DateDistance from={user.expires} />}
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Scopes"
                  secondaryTypographyProps={{ component: 'div' }}
                  secondary={
                    currentScopes.length ? (
                      <List>
                        {currentScopes.map(scope => (
                          <ListItem key={scope}>
                            <ListItemText secondary={<code>{scope}</code>} />
                          </ListItem>
                        ))}
                      </List>
                    ) : (
                      'no scopes'
                    )
                  }
                />
              </ListItem>
            </List>
          </Fragment>
        )}
      </Dashboard>
    );
  }
}
