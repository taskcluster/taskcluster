import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { graphql, withApollo } from 'react-apollo';
import { bool } from 'prop-types';
import cloneDeep from 'lodash.clonedeep';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import { withStyles } from '@material-ui/core/styles';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import TextField from '@material-ui/core/TextField';
import Tooltip from '@material-ui/core/Tooltip';
import PlusIcon from 'mdi-react/PlusIcon';
import ContentSaveIcon from 'mdi-react/ContentSaveIcon';
import DeleteIcon from 'mdi-react/DeleteIcon';
import Button from '../../../components/Button';
import Dashboard from '../../../components/Dashboard';
import SpeedDial from '../../../components/SpeedDial';
import SpeedDialAction from '../../../components/SpeedDialAction';
import AwsProvisionerWorkerTypeEditor from '../../../components/AwsProvisionerWorkerTypeEditor';
import removeKeys from '../../../utils/removeKeys';
import formatError from '../../../utils/formatError';
import isWorkerTypeNameValid from '../../../utils/isWorkerTypeNameValid';
import { DEFAULT_AWS_WORKER_TYPE } from '../../../utils/constants';
import ErrorPanel from '../../../components/ErrorPanel';
import workerTypeQuery from './workerType.graphql';
import updateAwsProvisionerWorkerTypeQuery from './updateAwsProvisionerWorkerType.graphql';
import createAwsProvisionerWorkerTypeQuery from './createAwsProvisionerWorkerType.graphql';
import deleteAwsProvisionerWorkerTypeQuery from './deleteAwsProvisionerWorkerType.graphql';

/* eslint-disable no-param-reassign */
/** Encode/decode UserData property of object */
const encodeUserData = obj => {
  if (obj && obj.UserData) {
    obj.UserData = window.btoa(JSON.stringify(obj.UserData));
  }
};

@hot(module)
@withApollo
@graphql(workerTypeQuery, {
  skip: props => !props.match.params.workerType,
  options: ({ match: { params } }) => ({
    variables: {
      workerType: decodeURIComponent(params.workerType),
    },
  }),
})
@withStyles(theme => ({
  successIcon: {
    ...theme.mixins.successIcon,
  },
  deleteIcon: {
    ...theme.mixins.errorIcon,
  },
  fab: {
    ...theme.mixins.fab,
  },
}))
export default class ViewWorkerTypeDefinition extends Component {
  static defaultProps = {
    isNewWorkerType: false,
  };

  static getDerivedStateFromProps(props, state) {
    if (
      props.data &&
      props.data.awsProvisionerWorkerType &&
      !state.editorValue
    ) {
      return {
        // Apollo feature request: https://github.com/apollographql/apollo-feature-requests/issues/6
        editorValue: removeKeys(
          cloneDeep(props.data.awsProvisionerWorkerType),
          ['__typename']
        ),
        workerType: props.match.params.workerType,
      };
    }

    if (props.isNewWorkerType && !state.editorValue) {
      return {
        editorValue: DEFAULT_AWS_WORKER_TYPE,
      };
    }

    return null;
  }

  static propTypes = {
    /** Set to `true` when creating a new worker type. */
    isNewWorkerType: bool,
  };

  state = {
    workerType: '',
    editorValue: null,
    invalidDefinition: false,
    actionLoading: false,
    error: null,
  };

  handleCreateWorkerType = async () => {
    const { workerType } = this.state;
    const definition = this.cleanDefinition(this.state.editorValue);

    this.setState({ error: null, actionLoading: true });

    try {
      await this.props.client.mutate({
        mutation: createAwsProvisionerWorkerTypeQuery,
        variables: {
          workerType,
          payload: definition,
        },
      });

      this.setState({ actionLoading: false, error: null });
      this.props.history.push(
        `/aws-provisioner/${encodeURIComponent(workerType)}`
      );
    } catch (error) {
      this.setState({ actionLoading: false, error: formatError(error) });
    }
  };

  handleDeleteWorkerType = async () => {
    this.setState({ error: null, actionLoading: true });

    try {
      await this.props.client.mutate({
        mutation: deleteAwsProvisionerWorkerTypeQuery,
        variables: { workerType: this.props.match.params.workerType },
      });

      this.setState({ error: null, actionLoading: false });

      this.props.history.push(`/aws-provisioner`);
    } catch (error) {
      this.setState({ error: formatError(error), actionLoading: false });
    }
  };

  handleEditorChange = editorValue => {
    try {
      JSON.parse(editorValue);

      this.setState({
        editorValue,
        invalidDefinition: false,
      });
    } catch (err) {
      this.setState({
        editorValue,
        invalidDefinition: true,
      });
    }
  };

  handleInputChange = ({ target: { name, value } }) => {
    this.setState({ [name]: value });
  };

  handleUpdateWorkerType = async () => {
    const { editorValue } = this.state;
    const payload = this.cleanDefinition(editorValue);

    this.setState({ error: null, actionLoading: true });

    try {
      await this.props.client.mutate({
        mutation: updateAwsProvisionerWorkerTypeQuery,
        variables: { workerType: this.props.match.params.workerType, payload },
      });

      this.setState({ error: null, actionLoading: false });
    } catch (error) {
      this.setState({ error: formatError(error), actionLoading: false });
    }
  };

  cleanDefinition(original) {
    const definition =
      typeof original === 'string' ? JSON.parse(original) : original;

    /** * LEGACY NOTICE: This check and the actions it does are
     leftovers.  We'll soon be able to delete the check,
     the actions and the functions ** */
    if (definition.launchSpecification) {
      encodeUserData(definition.launchSpecification);
      definition.regions.forEach(({ overwrites }) =>
        encodeUserData(overwrites)
      );
      definition.instanceTypes.forEach(({ overwrites }) =>
        encodeUserData(overwrites)
      );
      /* END LEGACY */
    } else {
      // Remember that the provisioner api sets this
      delete definition.lastModified;
    }

    return definition;
  }

  render() {
    const {
      invalidDefinition,
      editorValue,
      actionLoading,
      workerType,
      error,
    } = this.state;
    const { isNewWorkerType, classes, data } = this.props;

    return (
      <Dashboard
        title={
          isNewWorkerType
            ? 'AWS Provisioner Create Worker Type'
            : 'AWS Provisioner Worker Type Definition'
        }>
        {data &&
          !data.awsProvisionerWorkerType &&
          data.loading && <Spinner loading />}
        {data && <ErrorPanel error={data.error} />}
        <ErrorPanel error={error} />
        <List>
          <ListItem>
            {isNewWorkerType ? (
              <TextField
                label="Worker Type"
                name="workerType"
                error={
                  Boolean(workerType) && !isWorkerTypeNameValid(workerType)
                }
                onChange={this.handleInputChange}
                fullWidth
                value={workerType}
              />
            ) : (
              workerType && (
                <ListItemText primary="Worker Type" secondary={workerType} />
              )
            )}
          </ListItem>
          {editorValue && (
            <ListItem>
              <AwsProvisionerWorkerTypeEditor
                value={editorValue}
                onEditorChange={this.handleEditorChange}
              />
            </ListItem>
          )}
        </List>
        {isNewWorkerType ? (
          <Tooltip title="Create Worker Type">
            <div className={classes.fab}>
              <Button
                requiresAuth
                onClick={this.handleCreateWorkerType}
                disabled={
                  invalidDefinition ||
                  !isWorkerTypeNameValid(workerType) ||
                  actionLoading
                }
                classes={{ root: classes.successIcon }}
                variant="round">
                <PlusIcon />
              </Button>
            </div>
          </Tooltip>
        ) : (
          <SpeedDial>
            <SpeedDialAction
              requiresAuth
              icon={<ContentSaveIcon />}
              className={classes.successIcon}
              tooltipTitle="Update Worker Type"
              onClick={this.handleUpdateWorkerType}
              ButtonProps={{ disabled: invalidDefinition || actionLoading }}
            />
            <SpeedDialAction
              requiresAuth
              icon={<DeleteIcon />}
              tooltipTitle="Delete Worker Type"
              className={classes.deleteIcon}
              onClick={this.handleDeleteWorkerType}
              ButtonProps={{ disabled: actionLoading }}
            />
          </SpeedDial>
        )}
      </Dashboard>
    );
  }
}
