import React, { Component } from 'react';
import { withRouter } from 'react-router-dom';
import { isEmpty, map, pipe, sort as rSort, path } from 'ramda';
import { any, arrayOf, string } from 'prop-types';
import LinkIcon from 'mdi-react/LinkIcon';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import { Badge, Tooltip } from '@material-ui/core';
import { memoize } from '../../utils/memoize';
import DataTable from '../DataTable';
import TableCellItem from '../TableCellItem';
import Link from '../../utils/Link';
import sort from '../../utils/sort';
import StatusLabel from '../StatusLabel';
import DateDistance from '../DateDistance';
import { hookWithLastFire } from '../../utils/prop-types';
import CopyToClipboardTableCell from '../CopyToClipboardTableCell';

@withRouter
export default class HooksListTable extends Component {
  static propTypes = {
    searchTerm: string,
    hooks: arrayOf(hookWithLastFire).isRequired,
    classes: any,
  };

  static defaultProps = {
    searchTerm: '',
  };

  state = {
    sortBy: null,
    sortDirection: null,
  };

  sortHooks = memoize(
    (hooks, sortBy, sortDirection, searchTerm) => {
      const filteredHooks = searchTerm
        ? hooks.filter(
            ({ hookId, hookGroupId }) =>
              hookGroupId.includes(searchTerm) || hookId.includes(searchTerm)
          )
        : hooks;
      const sortByPath = sortBy ? sortBy.split('.') : [];
      const propValue = obj => path(sortByPath, obj);

      return isEmpty(filteredHooks) || !sortBy
        ? filteredHooks
        : [...filteredHooks].sort((a, b) => {
            const firstElement =
              sortDirection === 'desc' ? propValue(b) : propValue(a);
            const secondElement =
              sortDirection === 'desc' ? propValue(a) : propValue(b);

            return sort(firstElement, secondElement);
          });
    },
    {
      serializer: ([hooks, sortBy, sortDirection, searchTerm]) => {
        const ids = pipe(
          rSort((a, b) => sort(a.hookId, b.hookId)),
          map(({ hookId }) => hookId)
        )(hooks);

        return `${ids.join('-')}-${sortBy}-${sortDirection}-${searchTerm}`;
      },
    }
  );

  handleHeaderClick = header => {
    const toggled = this.state.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = this.state.sortBy === header.id ? toggled : 'desc';

    this.setState({ sortBy: header.id, sortDirection });
  };

  renderTableRow = hook => {
    const { hookId, hookGroupId, schedule, bindings, lastFire } = hook;
    const hookUrl = `/hooks/${hookGroupId}/${encodeURIComponent(hookId)}`;
    const { classes } = this.props;
    const classNames = [];
    let error = null;

    if (lastFire?.error) {
      classNames.push(classes?.hasErrors);

      if (typeof lastFire.error === 'string') {
        try {
          const data = JSON.parse(lastFire.error);

          error = data?.body?.code;
        } catch (err) {
          error = lastFire.error;
        }
      } else if (lastFire.error?.body?.code) {
        error = lastFire.error.body.code;
      }
    }

    if (!lastFire?.taskId && !lastFire?.error) {
      classNames.push(classes?.noFires);
    }

    return (
      <TableRow key={`${hookGroupId}/${hookId}`} className={classNames}>
        <TableCell>
          <TableCellItem>{hookGroupId}</TableCellItem>
        </TableCell>

        <TableCell>
          <Link to={hookUrl}>{hookId}</Link>
        </TableCell>

        <TableCell>
          {schedule?.length ? (
            <Link to={hookUrl}>
              <TableCellItem>
                <code>{schedule[0]}</code>
                {schedule.length > 1 && (
                  <Tooltip
                    title={
                      <React.Fragment>
                        {schedule.slice(1, 10).map(b => (
                          <pre key={b}>{b}</pre>
                        ))}
                      </React.Fragment>
                    }>
                    <Badge
                      badgeContent={`+${schedule.length - 1}`}
                      color="secondary"
                    />
                  </Tooltip>
                )}
              </TableCellItem>
            </Link>
          ) : (
            undefined
          )}
          {bindings?.length ? (
            <Link to={hookUrl}>
              <TableCellItem>
                <code>
                  {bindings[0].exchange.replace('exchange/taskcluster-', '')}
                </code>
                {bindings.length > 1 && (
                  <Tooltip
                    title={
                      <React.Fragment>
                        {bindings.slice(1, 10).map(b => (
                          <pre key={b.exchange}>{b.exchange}</pre>
                        ))}
                      </React.Fragment>
                    }>
                    <Badge
                      badgeContent={`+${bindings.length - 1}`}
                      color="secondary"
                    />
                  </Tooltip>
                )}
              </TableCellItem>
            </Link>
          ) : (
            undefined
          )}
          {!schedule?.length && !bindings?.length && <em>n/a</em>}
        </TableCell>

        <TableCell>
          {lastFire?.taskId ? (
            <Link to={`/tasks/${lastFire.taskId}/runs/0`}>
              <TableCellItem button>
                <StatusLabel state={lastFire.taskState} />
                <span>
                  <LinkIcon size={16} />
                </span>
              </TableCellItem>
            </Link>
          ) : (
            undefined
          )}
          {error ? (
            <Link to={hookUrl}>
              <pre>{error}</pre>
            </Link>
          ) : (
            undefined
          )}
          {!lastFire?.taskId && !error && lastFire?.result ? (
            <span>{lastFire.result}</span>
          ) : (
            undefined
          )}
        </TableCell>

        <CopyToClipboardTableCell
          tooltipTitle={lastFire?.taskCreateTime}
          textToCopy={lastFire?.taskCreateTime}
          text={
            lastFire?.taskCreateTime ? (
              <DateDistance from={lastFire.taskCreateTime} />
            ) : (
              undefined
            )
          }
        />
      </TableRow>
    );
  };

  render() {
    const { hooks, searchTerm } = this.props;
    const { sortBy, sortDirection } = this.state;
    const sortedHooks = this.sortHooks(
      hooks,
      sortBy,
      sortDirection,
      searchTerm
    );
    const headers = [
      { label: 'Hook Group ID', id: 'hookGroupId', type: 'string' },
      { label: 'Hook ID', id: 'hookId', type: 'string' },
      {
        label: 'Schedule / Binding',
        id: 'schedule.0',
        type: 'string',
      },
      {
        label: 'Last Fire State',
        id: 'lastFire.taskState',
        type: 'string',
      },
      {
        label: 'Last Fire Time',
        id: 'lastFire.taskCreateTime',
        type: 'string',
      },
    ];

    return (
      <DataTable
        items={sortedHooks}
        sortByLabel={sortBy}
        sortDirection={sortDirection}
        onHeaderClick={this.handleHeaderClick}
        renderRow={this.renderTableRow}
        headers={headers}
      />
    );
  }
}
