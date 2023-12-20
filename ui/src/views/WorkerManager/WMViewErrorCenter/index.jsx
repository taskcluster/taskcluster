import React, { Component } from 'react';
import { graphql } from 'react-apollo';
import { TableRow, TableCell, Typography } from '@material-ui/core';
import MessageAlertIcon from 'mdi-react/MessageAlertIcon';
import LinkIcon from 'mdi-react/LinkIcon';
import Spinner from '../../../components/Spinner';
import Dashboard from '../../../components/Dashboard';
import ErrorPanel from '../../../components/ErrorPanel';
import errorsQuery from './wmPoolsErrors.graphql';
import WorkerManagerErrorsSummary from '../../../components/WMErrorsSummary';
import DataTable from '../../../components/DataTable';
import Link from '../../../utils/Link';
import TableCellItem from '../../../components/TableCellItem';
import Breadcrumbs from '../../../components/Breadcrumbs';

@graphql(errorsQuery)
export default class WMViewErrorCenter extends Component {
  state = {
    sort: 'errorsCount',
    direction: 'desc',
  };

  onHeaderClick(header) {
    const { sort, direction } = this.state;
    const { id } = header;

    if (id === sort) {
      this.setState({ direction: direction === 'desc' ? 'asc' : 'desc' });
    } else {
      this.setState({ sort: id, direction: 'desc' });
    }
  }

  sortItems(items) {
    const { sort, direction } = this.state;
    const sortedItems = items.sort((a, b) => {
      if (a[sort] < b[sort]) {
        return direction === 'asc' ? -1 : 1;
      }

      if (a[sort] > b[sort]) {
        return direction === 'asc' ? 1 : -1;
      }

      return 0;
    });

    return sortedItems;
  }

  render() {
    const {
      data: { loading, error, WorkerManagerErrorsStats },
    } = this.props;
    const items =
      !loading && !error
        ? this.sortItems(
            Object.entries(
              WorkerManagerErrorsStats?.totals?.workerPool
            ).map(([key, value]) => ({ workerPool: key, errorsCount: value }))
          )
        : [];
    const headers = [
      { label: 'Errors by Worker Pool', id: 'workerPool' },
      { label: 'Errors Count', id: 'errorsCount' },
    ];

    return (
      <Dashboard title="Worker Manager Errors Summary" disableTitleFormatting>
        <ErrorPanel fixed error={error} />

        <div style={{ flexGrow: 1, marginRight: 8 }}>
          <Breadcrumbs>
            <Link to="/worker-manager">
              <Typography variant="body2">Worker Manager</Typography>
            </Link>
            <Typography variant="body2" color="textSecondary">
              Provisioning errors
            </Typography>
          </Breadcrumbs>
        </div>

        {loading && <Spinner loading />}

        {!error && !loading && (
          <React.Fragment>
            <WorkerManagerErrorsSummary data={this.props.data} />

            <Typography variant="h6" gutterBottom>
              Errors by Worker Pool (last 7 days)
            </Typography>

            <DataTable
              items={items}
              headers={headers}
              onHeaderClick={header => this.onHeaderClick(header)}
              renderRow={row => (
                <TableRow key={row.workerPool}>
                  <TableCell>
                    <Link
                      title="View Worker Pool"
                      to={`/worker-manager/${encodeURIComponent(
                        row.workerPool
                      )}`}>
                      <TableCellItem button>
                        {row.workerPool}
                        <LinkIcon />
                      </TableCellItem>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      title="View errors"
                      to={`/worker-manager/${encodeURIComponent(
                        row.workerPool
                      )}/errors`}>
                      <TableCellItem button>
                        {row.errorsCount}
                        <MessageAlertIcon />
                      </TableCellItem>
                    </Link>
                  </TableCell>
                </TableRow>
              )}
            />
          </React.Fragment>
        )}
      </Dashboard>
    );
  }
}
