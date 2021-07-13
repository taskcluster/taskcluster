import React, { Component } from 'react';
import { graphql } from 'react-apollo';
import provisionersQuery from './provisioners.graphql';
import Spinner from '../../../components/Spinner';
import Dashboard from '../../../components/Dashboard';
import HelpView from '../../../components/HelpView';
import ErrorPanel from '../../../components/ErrorPanel';
import ProvisionerDetailsTable from '../../../components/ProvisionerDetailsTable';

@graphql(provisionersQuery)
export default class ViewProvisioners extends Component {
  render() {
    const {
      description,
      data: { loading, error, provisioners },
    } = this.props;

    return (
      <Dashboard
        title="Workers"
        helpView={<HelpView description={description} />}>
        {loading && <Spinner loading />}
        <ErrorPanel fixed error={error} />
        {provisioners && (
          <ProvisionerDetailsTable provisioners={provisioners.edges} />
        )}
      </Dashboard>
    );
  }
}
