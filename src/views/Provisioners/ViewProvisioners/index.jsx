import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { graphql } from 'react-apollo';
import ErrorPanel from '@mozilla-frontend-infra/components/ErrorPanel';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import { withStyles } from '@material-ui/core/styles';
import Grid from '@material-ui/core/Grid';
import provisionersQuery from './provisioners.graphql';
import Dashboard from '../../../components/Dashboard';
import HelpView from '../../../components/HelpView';
import ProvisionerDetailsCard from '../../../components/ProvisionerDetailsCard';

@hot(module)
@graphql(provisionersQuery)
@withStyles(theme => ({
  gridItem: {
    marginBottom: theme.spacing.double,
  },
}))
export default class ViewProvisioners extends Component {
  render() {
    const {
      classes,
      description,
      data: { loading, error, provisioners },
    } = this.props;

    return (
      <Dashboard
        title="Provisioners"
        helpView={<HelpView description={description} />}
      >
        {loading && <Spinner loading />}
        {error &&
          error.graphQLErrors && (
            <ErrorPanel error={error.graphQLErrors[0].message} />
          )}
        {provisioners && (
          <Grid container spacing={24}>
            {provisioners.edges.map(({ node: provisioner }) => (
              <Grid
                key={`${provisioner.provisionerId}-item`}
                className={classes.gridItem}
                item
                xs={12}
                sm={6}
                md={4}
              >
                <ProvisionerDetailsCard dense provisioner={provisioner} />
              </Grid>
            ))}
          </Grid>
        )}
      </Dashboard>
    );
  }
}
