import React, { Component, Fragment } from 'react';
import { Auth } from '@taskcluster/client-web';
import Typography from '@material-ui/core/Typography';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import { withStyles } from '@material-ui/core/styles';
import Spinner from '../../components/Spinner';
import Dashboard from '../../components/Dashboard';
import DateDistance from '../../components/DateDistance';
import { withAuth } from '../../utils/Auth';
import ErrorPanel from '../../components/ErrorPanel';
import { withTaskclusterClient } from '../../utils/TaskclusterClient';
import username from '../../utils/username';

@withAuth
@withTaskclusterClient
@withStyles({
  certificate: {
    wordBreak: 'break-word',
  },
})
export default class Profile extends Component {
  state = {
    currentScopes: null,
    loading: false,
    error: null,
  };

  get authClient() {
    return this.props.createTaskclusterClient({ Class: Auth });
  }

  componentDidMount() {
    this.loadCurrentScopes();
  }

  componentDidUpdate(prevProps) {
    if (this.props.user !== prevProps.user) {
      this.loadCurrentScopes();
    }
  }

  loadCurrentScopes = async () => {
    if (!this.props.user) {
      this.setState({ currentScopes: null, loading: false, error: null });

      return;
    }

    this.setState({ loading: true, error: null });

    try {
      const { scopes } = await this.authClient.currentScopes();

      this.setState({ currentScopes: scopes, loading: false, error: null });
    } catch (error) {
      this.setState({ currentScopes: null, loading: false, error });
    }
  };

  render() {
    const { user, classes } = this.props;
    const { currentScopes, loading, error } = this.state;

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
                  secondary={username(user)}
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
