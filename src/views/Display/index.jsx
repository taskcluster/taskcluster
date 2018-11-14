import React, { Component } from 'react';
import classNames from 'classnames';
import { withStyles } from '@material-ui/core/styles';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import LinkIcon from 'mdi-react/LinkIcon';
import VncDisplay from '../../components/VncDisplay';
import TableCellListItem from '../../components/TableCellListItem';
import Dashboard from '../../components/Dashboard';
import DataTable from '../../components/DataTable';
import { VNC_DISPLAYS_POLLING_INTERVAL } from '../../utils/constants';
import ErrorPanel from '../../components/ErrorPanel';

@withStyles({
  vncDisplay: {
    padding: 0,
  },
  displayText: {
    width: '100%',
  },
})
export default class Display extends Component {
  state = {
    display: null,
    displays: null,
    error: null,
  };

  componentDidMount() {
    this.loadDisplays();
  }

  handleDisplayClick = display => {
    this.setState({ display });
  };

  loadDisplays = async () => {
    const displaysUrl = new URLSearchParams(this.props.location.search).get(
      'displaysUrl'
    );

    this.setState({ error: false });

    try {
      const displays = await (await fetch(displaysUrl)).json();

      if (!displays || !displays.length) {
        window.setTimeout(this.loadDisplays, VNC_DISPLAYS_POLLING_INTERVAL);
      }

      this.setState({ displays });
    } catch (error) {
      this.setState({ error });
    }
  };

  render() {
    const { classes } = this.props;
    const { display, displays, error } = this.state;
    const search = new URLSearchParams(this.props.location.search);
    const iconSize = 16;
    const props = [
      'displaysUrl',
      'socketUrl',
      'v',
      'shared',
      'taskId',
      'runId',
    ].reduce(
      (props, key) => ({
        ...props,
        [key]: decodeURIComponent(search.get(key)),
      }),
      {}
    );

    return (
      <Dashboard
        className={classNames({
          [classes.vncDisplay]: Boolean(display),
        })}
        title={display ? 'VNC Display' : 'Displays'}>
        <ErrorPanel error={error} />
        {display && (
          <VncDisplay url={`${props.socketUrl}?display=${display}`} shared />
        )}
        {!display &&
          displays && (
            <DataTable
              items={displays}
              headers={['Display']}
              noItemsMessage={
                error ? 'No displays available.' : 'No displays yet. Loading...'
              }
              renderRow={({ display }) => (
                <TableRow key={display}>
                  <TableCell>
                    <TableCellListItem
                      button
                      onClick={() => this.handleDisplayClick(display)}>
                      <span className={classes.displayText}>{display}</span>
                      <LinkIcon size={iconSize} />
                    </TableCellListItem>
                  </TableCell>
                </TableRow>
              )}
            />
          )}
      </Dashboard>
    );
  }
}
