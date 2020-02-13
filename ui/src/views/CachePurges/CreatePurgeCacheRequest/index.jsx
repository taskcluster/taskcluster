import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { withApollo } from 'react-apollo';
import { withStyles } from '@material-ui/core/styles';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ContentSaveIcon from 'mdi-react/ContentSaveIcon';
import TextField from '../../../components/TextField';
import Dashboard from '../../../components/Dashboard';
import Button from '../../../components/Button';
import ErrorPanel from '../../../components/ErrorPanel';
import purgeCacheQuery from './purgeCache.graphql';

@hot(module)
@withApollo
@withStyles(theme => ({
  contentSaveButtonSpan: {
    ...theme.mixins.fab,
  },
  contentSaveIcon: {
    ...theme.mixins.successIcon,
  },
}))
export default class CreatePurgeCacheRequest extends Component {
  state = {
    provisionerId: '',
    workerType: '',
    cacheName: '',
    error: null,
    actionLoading: false,
  };

  handleCreate = async () => {
    const { provisionerId, workerType, cacheName } = this.state;

    this.setState({ error: null, actionLoading: true });

    try {
      await this.props.client.mutate({
        mutation: purgeCacheQuery,
        variables: {
          provisionerId,
          workerType,
          payload: { cacheName },
        },
      });

      this.setState({ error: null, actionLoading: false });

      this.props.history.push('/purge-caches');
    } catch (error) {
      this.setState({ error, actionLoading: false });
    }
  };

  handleInputChange = ({ target: { name, value } }) => {
    this.setState({ [name]: value });
  };

  isFormFilled = () => {
    const { provisionerId, workerType, cacheName } = this.state;

    return provisionerId && workerType && cacheName;
  };

  render() {
    const { classes } = this.props;
    const {
      error,
      provisionerId,
      workerType,
      cacheName,
      actionLoading,
    } = this.state;

    return (
      <Dashboard title="Create Purge Cache Request">
        <Fragment>
          <ErrorPanel fixed error={error} />
          <List>
            <ListItem>
              <TextField
                label="Provisioner ID"
                name="provisionerId"
                onChange={this.handleInputChange}
                fullWidth
                value={provisionerId}
              />
            </ListItem>
            <ListItem>
              <TextField
                label="Worker Type"
                name="workerType"
                onChange={this.handleInputChange}
                fullWidth
                value={workerType}
              />
            </ListItem>
            <ListItem>
              <TextField
                label="Cache Name"
                name="cacheName"
                onChange={this.handleInputChange}
                fullWidth
                value={cacheName}
              />
            </ListItem>
          </List>
          <Button
            spanProps={{ className: classes.contentSaveButtonSpan }}
            tooltipProps={{
              title: 'Create Request',
              id: 'create-purge-cache-request-tooltip',
              enterDelay: 300,
            }}
            requiresAuth
            disabled={!this.isFormFilled() || actionLoading}
            onClick={this.handleCreate}
            variant="round"
            classes={{ root: classes.contentSaveIcon }}>
            <ContentSaveIcon />
          </Button>
        </Fragment>
      </Dashboard>
    );
  }
}
