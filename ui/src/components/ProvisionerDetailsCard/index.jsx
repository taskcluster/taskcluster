import React, { Component, Fragment } from 'react';
import { withRouter } from 'react-router-dom';
import { bool } from 'prop-types';
import Markdown from '@mozilla-frontend-infra/components/Markdown';
import { withStyles } from '@material-ui/core/styles';
import Card from '@material-ui/core/Card';
import CardContent from '@material-ui/core/CardContent';
import Collapse from '@material-ui/core/Collapse';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import Typography from '@material-ui/core/Typography';
import ChevronUpIcon from 'mdi-react/ChevronUpIcon';
import ChevronDownIcon from 'mdi-react/ChevronDownIcon';
import LinkIcon from 'mdi-react/LinkIcon';
import DateDistance from '../DateDistance';
import Button from '../Button';
import StatusLabel from '../StatusLabel';
import DialogAction from '../DialogAction';
import { provisioner } from '../../utils/prop-types';
import { withAuth } from '../../utils/Auth';
import { ACTION_CONTEXT } from '../../utils/constants';

@withRouter
@withAuth
@withStyles(theme => ({
  actionButton: {
    marginRight: theme.spacing.unit,
    marginBottom: theme.spacing.unit,
    fontSize: '0.7rem',
  },
  headline: {
    paddingLeft: theme.spacing.triple,
    paddingRight: theme.spacing.triple,
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    overflow: 'hidden',
  },
  cardContent: {
    minHeight: 415,
    paddingLeft: 0,
    paddingRight: 0,
    paddingTop: theme.spacing.double,
    paddingBottom: theme.spacing.double,
    '&:last-child': {
      paddingBottom: theme.spacing.triple,
    },
  },
  sourceHeadline: {
    textOverflow: 'ellipsis',
    overflowX: 'hidden',
  },
  listItemButton: {
    ...theme.mixins.listItemButton,
  },
  pre: {
    margin: 0,
    fontSize: theme.typography.body2.fontSize,
  },
  errorPanel: {
    width: '100%',
  },
}))
/**
 * Render information in a card layout about a provisioner.
 */
export default class ProvisionerDetailsCard extends Component {
  static defaultProps = {
    dense: false,
  };

  static propTypes = {
    /** A GraphQL provisioner response. */
    provisioner: provisioner.isRequired,
    /** If true, the card component will be compact */
    dense: bool,
  };

  state = {
    showDescription: false,
    actionLoading: false,
    dialogOpen: false,
    dialogError: null,
    selectedAction: null,
  };

  handleActionClick = selectedAction => {
    this.setState({ dialogOpen: true, selectedAction });
  };

  handleActionError = dialogError => {
    this.setState({ dialogError, actionLoading: false });
  };

  // TODO: Action not working.
  handleActionSubmit = async () => {
    const { selectedAction } = this.state;
    const url = selectedAction.url.replace(
      '<provisionerId>',
      this.props.provisioner.provisionerId
    );

    this.setState({ actionLoading: true, dialogError: null });

    await fetch(url, {
      method: selectedAction.method,
      Authorization: `Bearer ${btoa(
        JSON.stringify(this.props.user.credentials)
      )}`,
    });

    this.setState({ actionLoading: false, dialogError: null });
  };

  handleDialogClose = () => {
    this.setState({ dialogOpen: false });
  };

  handleProvisionerChange = () => {
    this.props.history.push(
      `/provisioners/${this.props.provisioner.provisionerId}`
    );
  };

  handleToggleDescription = () => {
    this.setState({ showDescription: !this.state.showDescription });
  };

  renderActions = () => {
    const { classes, provisioner } = this.props;
    const { actionLoading } = this.state;
    const actions = provisioner.actions.filter(
      ({ context }) => context === ACTION_CONTEXT.PROVISIONER
    );

    if (actions.length) {
      return actions.map(action => (
        <Button
          key={action.title}
          spanProps={{ className: classes.actionButton }}
          tooltipProps={{
            enterDelay: 50,
            key: action.title,
            id: `${action.title}-tooltip`,
            title: action.description,
          }}
          requiresAuth
          onClick={() => this.handleActionClick(action)}
          disabled={actionLoading}
          size="small"
          variant="contained">
          {action.title}
        </Button>
      ));
    }

    return 'n/a';
  };

  render() {
    const { classes, provisioner, dense } = this.props;
    const {
      showDescription,
      dialogError,
      dialogOpen,
      selectedAction,
    } = this.state;

    return (
      <Fragment>
        <Card raised>
          <CardContent classes={{ root: classes.cardContent }}>
            <Typography variant="h5" className={classes.headline}>
              {provisioner.provisionerId}
            </Typography>
            <List dense={dense}>
              <ListItem>
                <ListItemText
                  primary="Last Active"
                  secondary={<DateDistance from={provisioner.lastDateActive} />}
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Expires"
                  secondary={<DateDistance from={provisioner.expires} />}
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Stability"
                  secondary={<StatusLabel state={provisioner.stability} />}
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Actions"
                  secondary={this.renderActions()}
                />
              </ListItem>
              <ListItem
                className={classes.listItemButton}
                button
                onClick={this.handleProvisionerChange}>
                <ListItemText primary="Explore worker type" />
                <LinkIcon />
              </ListItem>
              {provisioner.description ? (
                <Fragment>
                  <ListItem
                    button
                    className={classes.listItemButton}
                    onClick={this.handleToggleDescription}>
                    <ListItemText primary="Description" />
                    {showDescription ? <ChevronUpIcon /> : <ChevronDownIcon />}
                  </ListItem>
                  <Collapse in={showDescription} timeout="auto">
                    <List component="div" disablePadding>
                      <ListItem>
                        <ListItemText
                          secondary={
                            <Markdown>{provisioner.description}</Markdown>
                          }
                        />
                      </ListItem>
                    </List>
                  </Collapse>
                </Fragment>
              ) : (
                <ListItem>
                  <ListItemText primary="Description" secondary="n/a" />
                </ListItem>
              )}
            </List>
          </CardContent>
        </Card>
        {dialogOpen && (
          <DialogAction
            error={dialogError}
            open={dialogOpen}
            title={`${selectedAction.title}?`}
            body={selectedAction.description}
            confirmText={selectedAction.title}
            onSubmit={this.handleActionSubmit}
            onError={this.handleActionError}
            onComplete={this.handleDialogClose}
            onClose={this.handleDialogClose}
          />
        )}
      </Fragment>
    );
  }
}
