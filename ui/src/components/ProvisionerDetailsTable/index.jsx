import React, { Component, Fragment } from 'react';
import { arrayOf } from 'prop-types';
import LinkIcon from 'mdi-react/LinkIcon';
import { withRouter } from 'react-router-dom';
import { withStyles } from '@material-ui/core/styles';
import TableCell from '@material-ui/core/TableCell';
import TableRow from '@material-ui/core/TableRow';
import IconButton from '@material-ui/core/IconButton';
import InformationVariantIcon from 'mdi-react/InformationVariantIcon';
import {
  Drawer,
  Typography,
  List,
  ListItem,
  ListItemText,
} from '@material-ui/core';
import Button from '../Button';
import TableCellItem from '../TableCellItem';
import Link from '../../utils/Link';
import { withAuth } from '../../utils/Auth';
import DataTable from '../DataTable';
import StatusLabel from '../StatusLabel';
import DateDistance from '../DateDistance';
import sort from '../../utils/sort';
import Markdown from '../Markdown';
import DialogAction from '../DialogAction';
import { ACTION_CONTEXT } from '../../utils/constants';
import { provisioner } from '../../utils/prop-types';

@withRouter
@withAuth
@withStyles(theme => ({
  infoButton: {
    marginLeft: -theme.spacing(2),
    marginRight: theme.spacing(1),
    borderRadius: 4,
  },
  headline: {
    paddingLeft: theme.spacing(2),
    paddingRight: theme.spacing(2),
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    overflow: 'hidden',
  },
  metadataContainer: {
    paddingTop: theme.spacing(2),
    paddingBottom: theme.spacing(2),
    width: 400,
  },
  actionButton: {
    marginRight: theme.spacing(0.5),
    marginTop: theme.spacing(1),
  },
}))
export default class ProvisionerDetailsTable extends Component {
  static propTypes = {
    provisioners: arrayOf(provisioner).isRequired,
  };

  state = {
    sortBy: null,
    sortDirection: null,
    drawerOpen: false,
    drawerProvisioner: null,
    actionLoading: false,
    dialogOpen: false,
    dialogError: null,
    selectedAction: null,
  };

  sortProvisioners = (provisioners, sortBy, sortDirection) => {
    if (!sortBy) {
      return provisioners;
    }

    return provisioners.sort((a, b) => {
      const firstElement =
        sortDirection === 'desc' ? b.node[sortBy] : a.node[sortBy];
      const secondElement =
        sortDirection === 'desc' ? a.node[sortBy] : b.node[sortBy];

      return sort(firstElement, secondElement);
    });
  };

  handleHeaderClick = ({ id: sortBy }) => {
    const toggled = this.state.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = this.state.sortBy === sortBy ? toggled : 'desc';

    this.setState({ sortBy, sortDirection });
  };

  handleDrawerOpen = provisioner => {
    this.setState({
      drawerOpen: true,
      drawerProvisioner: provisioner,
    });
  };

  handleDrawerClose = () => {
    this.setState({
      drawerOpen: false,
    });
  };

  handleActionClick = selectedAction => {
    this.setState({ dialogOpen: true, selectedAction });
  };

  handleActionError = dialogError => {
    this.setState({ dialogError, actionLoading: false });
  };

  // TODO: Action not working.
  handleActionSubmit = async () => {
    const { selectedAction, drawerProvisioner: provisioner } = this.state;
    const url = selectedAction.url.replace(
      '<provisionerId>',
      provisioner.provisionerId
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

  renderTableRow = ({ node: provisioner }) => {
    const iconSize = 16;
    const { classes } = this.props;

    return (
      <TableRow key={`${provisioner.provisionerId}`}>
        <TableCell>
          <IconButton
            className={classes.infoButton}
            name={provisioner.provisionerId}
            onClick={() => this.handleDrawerOpen(provisioner)}>
            <InformationVariantIcon size={iconSize} />
          </IconButton>
          <Link
            to={`/provisioners/${provisioner.provisionerId}`}
            title={`Explore worker types for ${provisioner.provisionerId}`}>
            <TableCellItem button>
              {provisioner.provisionerId}
              <LinkIcon size={iconSize} />
            </TableCellItem>
          </Link>
        </TableCell>
        <TableCell>
          <DateDistance from={provisioner.lastDateActive} />
        </TableCell>
        <TableCell>
          <DateDistance from={provisioner.expires} />
        </TableCell>
        <TableCell>
          <StatusLabel state={provisioner.stability} />
        </TableCell>
      </TableRow>
    );
  };

  renderDrawerContent = () => {
    const { classes } = this.props;
    const { drawerProvisioner } = this.state;

    return (
      <div className={classes.metadataContainer}>
        <Typography variant="h5" className={classes.headline}>
          {drawerProvisioner && drawerProvisioner.provisionerId}
        </Typography>
        <List>
          <ListItem>
            <ListItemText
              primary="Description"
              secondary={
                drawerProvisioner && drawerProvisioner.description ? (
                  <Markdown>{drawerProvisioner.description}</Markdown>
                ) : (
                  'n/a'
                )
              }
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Actions"
              secondary={
                drawerProvisioner && drawerProvisioner.actions.length
                  ? this.renderActions()
                  : 'n/a'
              }
            />
          </ListItem>
        </List>
      </div>
    );
  };

  renderActions = () => {
    const { classes } = this.props;
    const { actionLoading, drawerProvisioner: provisioner } = this.state;
    const { actions } = provisioner.actions.filter(
      ({ context }) => context === ACTION_CONTEXT.PROVISIONER
    );

    if (actions.length) {
      return actions.map(action => (
        <Button
          classes={{ root: classes.actionButton }}
          key={action.title}
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
  };

  render() {
    const { provisioners } = this.props;
    const {
      sortBy,
      sortDirection,
      drawerOpen,
      dialogError,
      dialogOpen,
      selectedAction,
    } = this.state;
    const headers = [
      { label: 'Provisioner', id: 'provisionerId', type: 'string' },
      { label: 'Last Active', id: 'lastDateActive', type: 'string' },
      { label: 'Expires', id: 'expires', type: 'string' },
      { label: 'Stability', id: 'stability', type: 'string' },
    ];

    this.sortProvisioners(provisioners, sortBy, sortDirection);

    return (
      <Fragment>
        <DataTable
          items={provisioners}
          sortByLabel={sortBy}
          sortDirection={sortDirection}
          onHeaderClick={this.handleHeaderClick}
          renderRow={this.renderTableRow}
          headers={headers}
        />
        <Drawer
          anchor="right"
          open={drawerOpen}
          onClose={this.handleDrawerClose}>
          {this.renderDrawerContent()}
        </Drawer>
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
