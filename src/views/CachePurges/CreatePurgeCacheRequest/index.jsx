import { hot } from 'react-hot-loader';
import { Component, Fragment } from 'react';
import { withStyles } from '@material-ui/core/styles';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import TextField from '@material-ui/core/TextField';
import Tooltip from '@material-ui/core/Tooltip';
import PlusIcon from 'mdi-react/PlusIcon';
import Dashboard from '../../../components/Dashboard';
import Button from '../../../components/Button';

@hot(module)
@withStyles(theme => ({
  plusButton: {
    ...theme.mixins.fab,
  },
  plusIcon: {
    ...theme.mixins.successIcon,
  },
}))
export default class CreatePurgeCacheRequest extends Component {
  state = {
    provisionerId: '',
    workerType: '',
    cacheName: '',
  };

  handleInputChange = ({ target: { name, value } }) => {
    this.setState({ [name]: value });
  };

  isFormFilled = () => {
    const { provisionerId, workerType, cacheName } = this.state;

    return provisionerId && workerType && cacheName;
  };

  // TODO: Add action request
  handleCreate() {}

  render() {
    const { classes } = this.props;
    const { provisionerId, workerType, cacheName } = this.state;

    return (
      <Dashboard title="Create Purge Cache Request">
        <Fragment>
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
          <Tooltip
            enterDelay={300}
            id="create-purge-cache-request-tooltip"
            title="Create Request">
            <Button
              requiresAuth
              disabled={!this.isFormFilled()}
              onClick={this.handleCreate}
              variant="fab"
              classes={{ root: classes.plusIcon }}
              className={classes.plusButton}>
              <PlusIcon />
            </Button>
          </Tooltip>
        </Fragment>
      </Dashboard>
    );
  }
}
