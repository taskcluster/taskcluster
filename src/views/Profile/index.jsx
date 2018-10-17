import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { graphql } from 'react-apollo';
import ErrorPanel from '@mozilla-frontend-infra/components/ErrorPanel';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Typography from '@material-ui/core/Typography';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import Dashboard from '../../components/Dashboard';
import DateDistance from '../../components/DateDistance';
import { withAuth } from '../../utils/Auth';
import profileQuery from './profile.graphql';

@hot(module)
@withAuth
@graphql(profileQuery)
export default class Profile extends Component {
  render() {
    const {
      classes,
      user,
      data: { currentScopes, loading, error },
    } = this.props;

    return (
      <Dashboard title="Profile" className={classes.root}>
        {!currentScopes && loading && <Spinner loading />}
        {error && error.graphQLErrors && <ErrorPanel error={error} />}
        {user &&
          currentScopes && (
            <Fragment>
              <Typography variant="subtitle1">
                Credential Information
              </Typography>
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
                        <code>{user.credentials.certificate}</code>
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
                        'n/a'
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
