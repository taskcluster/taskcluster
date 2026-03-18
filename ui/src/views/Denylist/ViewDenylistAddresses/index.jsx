import { withStyles } from '@material-ui/core/styles';
import PlusIcon from 'mdi-react/PlusIcon';
import { PureComponent } from 'react';
import Button from '../../../components/Button';
import Dashboard from '../../../components/Dashboard';
import HelpView from '../../../components/HelpView';
import Search from '../../../components/Search';
import Denylist from './Denylist';

@withStyles((theme) => ({
  plusIconSpan: {
    ...theme.mixins.fab,
  },
}))
export default class ViewDenylist extends PureComponent {
  state = {
    searchTerm: '',
  };

  handleSearchSubmit = (searchTerm) => {
    this.setState({ searchTerm });
  };

  handleAddressAdd = () => {
    this.props.history.push('/notify/denylist/add');
  };

  render() {
    const { classes, description } = this.props;
    const { searchTerm } = this.state;

    return (
      <Dashboard
        title="Denylist Addresses"
        helpView={<HelpView description={description} />}
        search={<Search onSubmit={this.handleSearchSubmit} placeholder="Address contains" />}
      >
        <Denylist searchTerm={searchTerm} />
        <Button
          spanProps={{ className: classes.plusIconSpan }}
          tooltipProps={{ title: 'Add Address' }}
          onClick={this.handleAddressAdd}
          variant="round"
          color="secondary"
        >
          <PlusIcon />
        </Button>
      </Dashboard>
    );
  }
}
