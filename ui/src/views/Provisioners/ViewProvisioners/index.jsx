import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { graphql } from 'react-apollo';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import { withStyles } from '@material-ui/core/styles';
import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';
import provisionersQuery from './provisioners.graphql';
import Dashboard from '../../../components/Dashboard';
import HelpView from '../../../components/HelpView';
import ProvisionerDetailsCard from '../../../components/ProvisionerDetailsCard';
import ErrorPanel from '../../../components/ErrorPanel';
import Breadcrumbs from '../../../components/Breadcrumbs';

@hot(module)
@graphql(provisionersQuery)
@withStyles(theme => ({
  gridItem: {
    marginBottom: theme.spacing.double,
  },
  link: {
    ...theme.mixins.link,
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
        helpView={<HelpView description={description} />}>
        {loading && <Spinner loading />}
        <ErrorPanel fixed error={error} />
        {provisioners && (
          <Fragment>
            <Breadcrumbs>
              <Typography color="textSecondary">Provisioners</Typography>
            </Breadcrumbs>
            <br />
            <Grid container spacing={24}>
              {provisioners.edges.map(({ node: provisioner }) => (
                <Grid
                  key={`${provisioner.provisionerId}-item`}
                  className={classes.gridItem}
                  item
                  xs={12}
                  sm={6}
                  md={4}>
                  <ProvisionerDetailsCard dense provisioner={provisioner} />
                </Grid>
              ))}
            </Grid>
          </Fragment>
        )}
      </Dashboard>
    );
  }
}
