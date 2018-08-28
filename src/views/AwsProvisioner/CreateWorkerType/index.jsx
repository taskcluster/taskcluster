import { hot } from 'react-hot-loader';
import { Component } from 'react';
import { withApollo } from 'react-apollo';
import ErrorPanel from '@mozilla-frontend-infra/components/ErrorPanel';
import { withStyles } from '@material-ui/core/styles';
import Tooltip from '@material-ui/core/Tooltip';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import TextField from '@material-ui/core/TextField';
import PlusIcon from 'mdi-react/PlusIcon';
import Dashboard from '../../../components/Dashboard';
import Button from '../../../components/Button';
import AwsProvisionerWorkerTypeEditor from '../../../components/AwsProvisionerWorkerTypeEditor';
import isWorkerTypeNameValid from '../../../utils/isWorkerTypeNameValid';
import formatError from '../../../utils/formatError';
import { DEFAULT_AWS_WORKER_TYPE } from '../../../utils/constants';
import createAwsProvisionerWorkerTypeQuery from './createAwsProvisionerWorkerType.graphql';

/* eslint-disable no-param-reassign */
/** Encode/decode UserData property of object */
const encodeUserData = obj => {
  if (obj && obj.UserData) {
    obj.UserData = window.btoa(JSON.stringify(obj.UserData));
  }
};

@hot(module)
@withApollo
@withStyles(theme => ({
  fab: {
    ...theme.mixins.fab,
  },
}))
export default class CreateWorkerType extends Component {
  state = {
    workerType: '',
    definition: DEFAULT_AWS_WORKER_TYPE,
    invalidDefinition: false,
    error: null,
    loading: null,
  };

  handleEditorChange = definition => {
    try {
      JSON.parse(definition);

      this.setState({
        definition,
        invalidDefinition: false,
      });
    } catch (err) {
      this.setState({
        definition,
        invalidDefinition: true,
      });
    }
  };

  handleInputChange = ({ target: { name, value } }) => {
    this.setState({ [name]: value });
  };

  handleCreateWorkerType = async () => {
    const { workerType } = this.state;
    const definition = this.cleanDefinition(this.state.definition);

    this.setState({ error: null, loading: true });

    try {
      await this.props.client.mutate({
        mutation: createAwsProvisionerWorkerTypeQuery,
        variables: {
          workerType,
          payload: definition,
        },
      });

      this.setState({ loading: false, error: null });
      this.props.history.push(
        `/aws-provisioner/${encodeURIComponent(workerType)}`
      );
    } catch (error) {
      this.setState({ loading: false, error: formatError(error) });
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
    const { classes } = this.props;
    const {
      error,
      definition,
      workerType,
      invalidDefinition,
      loading,
    } = this.state;

    return (
      <Dashboard title="AWS Provisioner Create Worker Type">
        {error && <ErrorPanel error={error} />}
        <List>
          <ListItem>
            <TextField
              label="Worker Type"
              name="workerType"
              error={Boolean(workerType) && !isWorkerTypeNameValid(workerType)}
              onChange={this.handleInputChange}
              fullWidth
              value={workerType}
            />
          </ListItem>
          <ListItem>
            <AwsProvisionerWorkerTypeEditor
              value={definition}
              onEditorChange={this.handleEditorChange}
            />
          </ListItem>
        </List>

        <Tooltip placement="bottom" title="Create Worker Type">
          <div className={classes.fab}>
            <Button
              requiresAuth
              onClick={this.handleCreateWorkerType}
              disabled={
                invalidDefinition ||
                !isWorkerTypeNameValid(workerType) ||
                loading
              }
              variant="fab"
              color="secondary">
              <PlusIcon />
            </Button>
          </div>
        </Tooltip>
      </Dashboard>
    );
  }
}
