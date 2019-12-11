import React, { PureComponent } from 'react';
import { hot } from 'react-hot-loader';
import Typography from '@material-ui/core/Typography';
import Dashboard from '../../../components/Dashboard';
import Search from '../../../components/Search';
import HelpView from '../../../components/HelpView';

@hot(module)
export default class ListScopes extends PureComponent {
  handleSearchSubmit = searchTerm => {
    this.props.history.push(`/auth/scopes/${encodeURIComponent(searchTerm)}`);
  };

  render() {
    const { description } = this.props;

    return (
      <Dashboard
        title="Scopes"
        helpView={<HelpView description={description} />}
        search={
          <Search
            placeholder="Scope contains"
            onSubmit={this.handleSearchSubmit}
          />
        }>
        <Typography gutterBottom variant="subtitle1">
          Enter a scope in the search box to find roles and clients with a given
          scope.
        </Typography>
      </Dashboard>
    );
  }
}
