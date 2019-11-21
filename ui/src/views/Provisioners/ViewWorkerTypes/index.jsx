import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { graphql } from 'react-apollo';
import dotProp from 'dot-prop-immutable';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Typography from '@material-ui/core/Typography';
import { withStyles } from '@material-ui/core/styles';
import MenuItem from '@material-ui/core/MenuItem';
import TextField from '@material-ui/core/TextField';
import WorkerTypesTable from '../../../components/WorkerTypesTable';
import Dashboard from '../../../components/Dashboard';
import { VIEW_WORKER_TYPES_PAGE_SIZE } from '../../../utils/constants';
import ErrorPanel from '../../../components/ErrorPanel';
import Breadcrumbs from '../../../components/Breadcrumbs';
import Link from '../../../utils/Link';
import workerTypesQuery from './workerTypes.graphql';

@hot(module)
@withStyles(theme => ({
  bar: {
    display: 'flex',
    alignItems: 'center',
  },
  breadcrumbsPaper: {
    marginRight: theme.spacing(4),
    flex: 1,
  },
  dropdown: {
    minWidth: 200,
  },
  link: {
    ...theme.mixins.link,
  },
}))
@graphql(workerTypesQuery, {
  skip: props => !props.match.params.provisionerId,
  options: ({
    match: {
      params: { provisionerId },
    },
  }) => ({
    variables: {
      provisionerId,
      workerTypesConnection: {
        limit: VIEW_WORKER_TYPES_PAGE_SIZE,
      },
    },
  }),
})
export default class ViewWorkerTypes extends Component {
  handlePageChange = ({ cursor, previousCursor }) => {
    const {
      match: {
        params: { provisionerId },
      },
      data: { fetchMore },
    } = this.props;

    return fetchMore({
      query: workerTypesQuery,
      variables: {
        provisionerId,
        workerTypesConnection: {
          limit: VIEW_WORKER_TYPES_PAGE_SIZE,
          cursor,
          previousCursor,
        },
      },
      updateQuery(
        previousResult,
        {
          fetchMoreResult: { workerTypes },
        }
      ) {
        const { edges, pageInfo } = workerTypes;

        if (!edges.length) {
          return previousResult;
        }

        return dotProp.set(previousResult, `workerTypes`, workerTypes =>
          dotProp.set(
            dotProp.set(workerTypes, 'edges', edges),
            'pageInfo',
            pageInfo
          )
        );
      },
    });
  };

  handleProvisionerChange = ({ target }) => {
    this.props.history.push(`/provisioners/${target.value}/worker-types`);
  };

  render() {
    const {
      classes,
      match: {
        params: { provisionerId },
      },
      data: { loading, error, provisioners, workerTypes },
    } = this.props;

    return (
      <Dashboard title="Worker Types">
        <Fragment>
          {!workerTypes && loading && <Spinner loading />}
          <ErrorPanel fixed error={error} />
          {provisioners && workerTypes && (
            <Fragment>
              <div className={classes.bar}>
                <Breadcrumbs classes={{ paper: classes.breadcrumbsPaper }}>
                  <Link to="/provisioners">
                    <Typography variant="body2" className={classes.link}>
                      Workers
                    </Typography>
                  </Link>
                  <Typography variant="body2" color="textSecondary">
                    {`${provisionerId}`}
                  </Typography>
                </Breadcrumbs>
                <TextField
                  disabled={loading}
                  className={classes.dropdown}
                  select
                  label="Provisioner ID"
                  value={provisionerId}
                  onChange={this.handleProvisionerChange}>
                  <MenuItem value="">
                    <em>None</em>
                  </MenuItem>
                  {provisioners.edges.map(({ node }) => (
                    <MenuItem
                      key={node.provisionerId}
                      value={node.provisionerId}>
                      {node.provisionerId}
                    </MenuItem>
                  ))}
                </TextField>
              </div>
              <br />
              <WorkerTypesTable
                workerTypesConnection={workerTypes}
                provisionerId={provisionerId}
                onPageChange={this.handlePageChange}
              />
            </Fragment>
          )}
        </Fragment>
      </Dashboard>
    );
  }
}
