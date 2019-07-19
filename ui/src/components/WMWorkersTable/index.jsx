import React, { Component } from 'react';
import { withRouter } from 'react-router-dom';
import { isEmpty, map, pipe, sort as rSort } from 'ramda';
import { camelCase } from 'change-case';
import memoize from 'fast-memoize';
import { formatDistanceStrict } from 'date-fns';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import { arrayOf } from 'prop-types';
import ContentCopyIcon from 'mdi-react/ContentCopyIcon';
import AlertIcon from 'mdi-react/AlertIcon';
import LinkIcon from 'mdi-react/LinkIcon';
import TableRow from '@material-ui/core/TableRow/TableRow';
import TableCell from '@material-ui/core/TableCell/TableCell';
import ListItemText from '@material-ui/core/ListItemText/ListItemText';
import Typography from '@material-ui/core/Typography/Typography';
import DataTable from '../DataTable';
import InheritMaterialUI  from '../InheritMaterialUI ';
import Link from '../../utils/Link';
import DateDistance from '../DateDistance';
import sort from '../../utils/sort';
import { WMWorker } from '../../utils/prop-types';

@withRouter
export default class WorkerManagerWorkersTable extends Component {
  static propTypes = {
    searchTerm: String,
    workers: arrayOf(WMWorker).isRequired,
  };

  static defaultProps = {
    searchTerm: '',
  };

  state = {
    sortBy: null,
    sortDirection: null,
  };

  sortWorkers = memoize(
    (workers, sortBy, sortDirection, searchTerm) => {
      const sortByProperty = camelCase(sortBy);
      const filteredWorkers = searchTerm
        ? workers.filter(({ w }) => w.includes(searchTerm))
        : workers;

      return isEmpty(filteredWorkers)
        ? filteredWorkers
        : [...filteredWorkers].sort((a, b) => {
            const firstElement =
              sortDirection === 'desc' ? b[sortByProperty] : a[sortByProperty];
            const secondElement =
              sortDirection === 'desc' ? a[sortByProperty] : b[sortByProperty];

            return sort(firstElement, secondElement);
          });
    },
    {
      serializer: ([workers, sortBy, sortDirection, searchTerm]) => {
        const ids = pipe(
          rSort((a, b) => sort(a.worker, b.worker)),
          map(({ worker }) => worker)
        )(workers);

        return `${ids.join('-')}-${sortBy}-${sortDirection}-${searchTerm}`;
      },
    }
  );

  handleHeaderClick = sortBy => {
    const toggled = this.state.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = this.state.sortBy === sortBy ? toggled : 'desc';

    this.setState({ sortBy, sortDirection });
  };

  renderTableRow = worker => {
    const {
      match: { path },
    } = this.props;
    const {
      workerId,
      workerGroup,
      latestTaskRun,
      workerAge,
      quarantineUntil,
      recentErrors,
      workerPool,
    } = worker;
    const iconSize = 16;

    return (
      <TableRow key={workerId}>
        <TableCell>{workerGroup}</TableCell>

        <TableCell>
          <InheritMaterialUI  button component={Link} to={`${path}/tasks`}>
            <ListItemText
              disableTypography
              primary={<Typography>{workerId}</Typography>}
            />
            <LinkIcon size={iconSize} />
          </InheritMaterialUI >
        </TableCell>

        <CopyToClipboard title={`${workerAge} (Copy)`} text={workerAge}>
          <TableCell>
            <InheritMaterialUI  button>
              <ListItemText
                disableTypography
                primary={
                  <Typography>
                    <DateDistance from={workerAge} />
                  </Typography>
                }
              />
              <ContentCopyIcon size={iconSize} />
            </InheritMaterialUI >
          </TableCell>
        </CopyToClipboard>

        <TableCell>
          {latestTaskRun ? (
            <InheritMaterialUI 
              button
              component={Link}
              to={`/tasks/${latestTaskRun.taskId}/runs/${latestTaskRun.runId}`}>
              <ListItemText
                disableTypography
                primary={<Typography>{latestTaskRun.taskId}</Typography>}
              />
              <LinkIcon size={iconSize} />
            </InheritMaterialUI >
          ) : (
            <Typography>n/a</Typography>
          )}
        </TableCell>

        {latestTaskRun ? (
          <CopyToClipboard
            title={`${latestTaskRun.started} (Copy)`}
            text={latestTaskRun.started}>
            <TableCell>
              <InheritMaterialUI  button>
                <ListItemText
                  disableTypography
                  primary={
                    <Typography>
                      <DateDistance from={latestTaskRun.started} />
                    </Typography>
                  }
                />
                <ContentCopyIcon size={iconSize} />
              </InheritMaterialUI >
            </TableCell>
          </CopyToClipboard>
        ) : (
          <TableCell>
            <Typography>n/a</Typography>
          </TableCell>
        )}

        {latestTaskRun ? (
          <CopyToClipboard
            title={`${latestTaskRun.resolved} (Copy)`}
            text={latestTaskRun.resolved}>
            <TableCell>
              <InheritMaterialUI  button>
                <ListItemText
                  disableTypography
                  primary={
                    <Typography>
                      <DateDistance from={latestTaskRun.resolved} />
                    </Typography>
                  }
                />
                <ContentCopyIcon size={iconSize} />
              </InheritMaterialUI >
            </TableCell>
          </CopyToClipboard>
        ) : (
          <TableCell>
            <Typography>n/a</Typography>
          </TableCell>
        )}

        <TableCell>
          <InheritMaterialUI  button component={Link} to={`${path}/errors`}>
            <ListItemText
              disableTypography
              primary={<Typography>Click to see errors</Typography>}
            />
            <AlertIcon size={iconSize} />
          </InheritMaterialUI >
        </TableCell>

        <TableCell>
          <InheritMaterialUI 
            button
            component={Link}
            to={`${path}/worker-types/${workerPool}/workers/${workerGroup}/${workerId}/resources`}>
            <ListItemText
              disableTypography
              primary={<Typography>{`${recentErrors}`}</Typography>}
            />
            <LinkIcon size={iconSize} />
          </InheritMaterialUI >
        </TableCell>

        <TableCell>
          {quarantineUntil ? (
            formatDistanceStrict(new Date(), quarantineUntil, {
              unit: 'd',
            })
          ) : (
            <Typography>n/a</Typography>
          )}
        </TableCell>
      </TableRow>
    );
  };

  render() {
    const { workers, searchTerm } = this.props;
    const { sortBy, sortDirection } = this.state;
    const sortedWorkers = this.sortWorkers(
      workers,
      sortBy,
      sortDirection,
      searchTerm
    );

    return (
      <DataTable
        items={sortedWorkers}
        sortByHeader={sortBy}
        sortDirection={sortDirection}
        onHeaderClick={this.handleHeaderClick}
        renderRow={this.renderTableRow}
        headers={[
          'Worker Group',
          'Worker ID',
          'First Claim',
          'Most Recent Task',
          'Task Started',
          'Task Resolved',
          'Recent Provisioning Errors',
          'Resources',
          'Quarantined',
        ]}
        padding="dense"
      />
    );
  }
}
