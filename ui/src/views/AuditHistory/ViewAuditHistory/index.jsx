import React, { Component } from 'react';
import { withStyles } from '@material-ui/core/styles';
import Card from '@material-ui/core/Card';
import CardContent from '@material-ui/core/CardContent';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import { formatDistanceStrict } from 'date-fns';
import Spinner from '../../../components/Spinner';
import Dashboard from '../../../components/Dashboard';
import ErrorPanel from '../../../components/ErrorPanel';
import DataTable from '../../../components/DataTable';
import { getAuditHistory } from '../../../utils/client';
import { withAuth } from '../../../utils/Auth';

const useStyles = theme => ({
  cardContent: {
    paddingLeft: 0,
    paddingRight: 0,
  },
  card: {
    marginBottom: theme.spacing(2),
  },
  tableCell: {
    whiteSpace: 'nowrap',
  },
});

@withStyles(useStyles)
@withAuth
export default class ViewAuditHistory extends Component {
  state = {
    auditHistory: null,
    loading: true,
    error: null,
    continuationToken: null,
    sortBy: null,
    sortDirection: 'desc',
  };

  async componentDidMount() {
    await this.loadAuditHistory();
  }

  loadAuditHistory = async (options = {}) => {
    const { entityType, entityId } = this.props.match.params;
    const { user } = this.props;
    const { continuationToken } = options;

    try {
      const response = await getAuditHistory(entityId, entityType, user, {
        continuationToken,
        limit: '10',
      });

      this.setState(prevState => ({
        auditHistory: continuationToken
          ? [...(prevState.auditHistory || []), ...response.auditHistory]
          : response.auditHistory,
        loading: false,
        continuationToken: response.continuationToken,
      }));
    } catch (error) {
      this.setState({
        error,
        loading: false,
      });
    }
  };

  handleHeaderClick = header => {
    const sortBy = header.id;
    const { sortDirection } = this.state;

    this.setState({
      sortBy,
      sortDirection: sortDirection === 'desc' ? 'asc' : 'desc',
    });
  };

  render() {
    const { auditHistory, loading, error, sortBy, sortDirection } = this.state;
    const { classes, match } = this.props;
    const { entityId } = match.params;
    const headers = [
      { id: 'action_type', label: 'Action Type' },
      { id: 'client_id', label: 'Client ID' },
      { id: 'created', label: 'Created' },
    ];

    console.log(`entity: `, match.params)

    return (
      <Dashboard title={`Audit History - ${decodeURIComponent(entityId)}`}>
        {loading && <Spinner loading />}
        <ErrorPanel error={error} />
        {auditHistory && (
          <Card className={classes.card}>
            <CardContent className={classes.cardContent}>
              <DataTable
                items={auditHistory}
                headers={headers}
                sortByLabel={sortBy}
                sortDirection={sortDirection}
                onHeaderClick={this.handleHeaderClick}
                renderRow={entry => (
                  <TableRow key={entry.created}>
                    <TableCell className={classes.tableCell}>
                      {entry.action_type}
                    </TableCell>
                    <TableCell className={classes.tableCell}>
                      {entry.client_id}
                    </TableCell>
                    <TableCell className={classes.tableCell}>
                      {formatDistanceStrict(new Date(entry.created), new Date())} ago
                    </TableCell>
                  </TableRow>
                )}
              />
            </CardContent>
          </Card>
        )}
      </Dashboard>
    );
  }
}
