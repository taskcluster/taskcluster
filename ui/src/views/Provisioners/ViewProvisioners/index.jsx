import React, { Component } from 'react';
import { Queue } from '@taskcluster/client-web';
import Spinner from '../../../components/Spinner';
import Dashboard from '../../../components/Dashboard';
import HelpView from '../../../components/HelpView';
import ErrorPanel from '../../../components/ErrorPanel';
import ProvisionerDetailsTable from '../../../components/ProvisionerDetailsTable';
import { withTaskclusterClient } from '../../../utils/TaskclusterClient';

@withTaskclusterClient
export default class ViewProvisioners extends Component {
  state = {
    provisioners: [],
    loading: true,
    error: null,
  };

  async componentDidMount() {
    try {
      const { provisioners } = await this.props
        .createTaskclusterClient({ Class: Queue })
        .listProvisioners();

      this.setState({ provisioners, loading: false });
    } catch (error) {
      this.setState({ error, loading: false });
    }
  }

  render() {
    const { description } = this.props;
    const { provisioners, loading, error } = this.state;

    return (
      <Dashboard
        title="Workers"
        helpView={<HelpView description={description} />}>
        {loading && <Spinner loading />}
        <ErrorPanel fixed error={error} />
        {provisioners.length > 0 && (
          <ProvisionerDetailsTable provisioners={provisioners} />
        )}
      </Dashboard>
    );
  }
}
