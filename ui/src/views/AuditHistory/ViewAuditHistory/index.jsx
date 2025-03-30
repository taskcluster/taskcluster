import React, { Component } from 'react';
import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import Card from '@material-ui/core/Card';
import CardContent from '@material-ui/core/CardContent';
import { formatDistanceStrict } from 'date-fns';
import Spinner from '../../../components/Spinner';
import Dashboard from '../../../components/Dashboard';
import ErrorPanel from '../../../components/ErrorPanel';
import { getAuditHistory } from '../../../utils/client';
import { withAuth } from '../../../utils/Auth';

const useStyles = theme => ({
  listItemText: {
    display: 'flex',
    flexDirection: 'column',
    paddingLeft: theme.spacing(2),
  },
  cardContent: {
    paddingLeft: 0,
    paddingRight: 0,
  },
  card: {
    marginBottom: theme.spacing(2),
  },
});

@withStyles(useStyles)
@withAuth
export default class ViewAuditHistory extends Component {
  state = {
    auditHistory: null,
    loading: true,
    error: null,
  };

  async componentDidMount() {
    await this.loadAuditHistory();
  }

  loadAuditHistory = async () => {
    const { clientId } = this.props.match.params;
    const { user } = this.props;

    try {
      const response = await getAuditHistory(clientId, 'client', user);

      if (!response.ok) {
        throw new Error(response.statusText);
      }

      const data = await response.json();

      this.setState({
        auditHistory: data.auditHistory,
        loading: false,
      });
    } catch (error) {
      this.setState({
        error,
        loading: false,
      });
    }
  };

  renderAuditEntry = entry => {
    const { classes } = this.props;

    return (
      <ListItem key={entry.created} divider>
        <ListItemText
          className={classes.listItemText}
          primary={
            <Typography variant="subtitle1">
              Action: {entry.actionType}
            </Typography>
          }
          secondary={
            <React.Fragment>
              <Typography variant="body2" color="textSecondary">
                Performed by: {entry.clientId}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {formatDistanceStrict(new Date(entry.created), new Date())} ago
              </Typography>
            </React.Fragment>
          }
        />
      </ListItem>
    );
  };

  render() {
    const { auditHistory, loading, error } = this.state;
    const { classes, match } = this.props;
    const { clientId } = match.params;

    return (
      <Dashboard title={`Audit History - ${decodeURIComponent(clientId)}`}>
        {loading && <Spinner loading />}
        <ErrorPanel error={error} />
        {auditHistory && (
          <Card className={classes.card}>
            <CardContent className={classes.cardContent}>
              <List disablePadding>
                {auditHistory.length > 0 ? (
                  auditHistory.map(this.renderAuditEntry)
                ) : (
                  <ListItem>
                    <ListItemText
                      primary={
                        <Typography>No audit history available</Typography>
                      }
                    />
                  </ListItem>
                )}
              </List>
            </CardContent>
          </Card>
        )}
      </Dashboard>
    );
  }
}
