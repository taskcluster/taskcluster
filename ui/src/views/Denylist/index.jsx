import { hot } from 'react-hot-loader';
import React, { PureComponent } from 'react';
import { withStyles } from '@material-ui/core/styles';
import PlusIcon from 'mdi-react/PlusIcon';
import Denylist from './Denylist';
import Dashboard from '../../components/Dashboard';
import Search from '../../components/Search';
import Button from '../../components/Button';
import HelpView from '../../components/HelpView';

@hot(module)
@withStyles(theme => ({
  plusIconSpan: {
    ...theme.mixins.fab,
  },
}))
export default class ViewDenylist extends PureComponent {
  state = {
    notificationsSearch: '',
  };

  handleNotificationsSearchSubmit = notificationsSearch => {
    this.setState({ notificationsSearch });
  };

  handleCreate = () => {
    // this.props.history.push('/auth/roles/create');
  };

  render() {
    const { classes } = this.props;
    const { notificationsSearch } = this.state;

    return (
      <Dashboard
        title="Notifications Denylist"
        helpView={<HelpView description="description" />}
        search={
          <Search
            onSubmit={this.handleNotificationsSearchSubmit}
            placeholder="Notification address contains"
          />
        }>
        <Denylist searchTerm={notificationsSearch} />
        <Button
          spanProps={{ className: classes.plusIconSpan }}
          tooltipProps={{ title: 'Add new address to denylist' }}
          onClick={this.handleCreate}
          variant="round"
          color="secondary">
          <PlusIcon />
        </Button>
      </Dashboard>
    );
  }
}
