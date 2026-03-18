import { Component } from 'react';
import { graphql } from 'react-apollo';
import Dashboard from '../../../components/Dashboard';
import ErrorPanel from '../../../components/ErrorPanel';
import HelpView from '../../../components/HelpView';
import ProvisionerDetailsTable from '../../../components/ProvisionerDetailsTable';
import Spinner from '../../../components/Spinner';
import provisionersQuery from './provisioners.graphql';

@graphql(provisionersQuery)
export default class ViewProvisioners extends Component {
  render() {
    const {
      description,
      data: { loading, error, provisioners },
    } = this.props;

    return (
      <Dashboard title="Workers" helpView={<HelpView description={description} />}>
        {loading && <Spinner loading />}
        <ErrorPanel fixed error={error} />
        {provisioners && <ProvisionerDetailsTable provisioners={provisioners.edges} />}
      </Dashboard>
    );
  }
}
