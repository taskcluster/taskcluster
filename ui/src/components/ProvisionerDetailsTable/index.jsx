import { Drawer, List, ListItem, ListItemText, Typography } from '@material-ui/core';
import IconButton from '@material-ui/core/IconButton';
import { withStyles } from '@material-ui/core/styles';
import TableCell from '@material-ui/core/TableCell';
import TableRow from '@material-ui/core/TableRow';
import InformationVariantIcon from 'mdi-react/InformationVariantIcon';
import LinkIcon from 'mdi-react/LinkIcon';
import { arrayOf } from 'prop-types';
import { parse, stringify } from 'qs';
import { Component, Fragment } from 'react';
import { withRouter } from 'react-router-dom';
import { withAuth } from '../../utils/Auth';
import { ACTION_CONTEXT } from '../../utils/constants';
import Link from '../../utils/Link';
import { provisioner } from '../../utils/prop-types';
import sort from '../../utils/sort';
import Button from '../Button';
import DataTable from '../DataTable';
import DateDistance from '../DateDistance';
import DialogAction from '../DialogAction';
import Markdown from '../Markdown';
import StatusLabel from '../StatusLabel';
import TableCellItem from '../TableCellItem';

@withRouter
@withAuth
@withStyles((theme) => ({
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
      const firstElement = sortDirection === 'desc' ? b.node[sortBy] : a.node[sortBy];
      const secondElement = sortDirection === 'desc' ? a.node[sortBy] : b.node[sortBy];

      return sort(firstElement, secondElement);
    });
  };

  handleHeaderClick = ({ id: sortBy }) => {
    const query = parse(this.props.location.search.slice(1));
    const toggled = query.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = query.sortBy === sortBy ? toggled : 'desc';

    query.sortBy = sortBy;
    query.sortDirection = sortDirection;
    this.props.history.replace({
      search: stringify(query, { addQueryPrefix: true }),
    });
  };

  handleDrawerOpen = (provisioner) => {
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

  handleActionClick = (selectedAction) => {
    this.setState({ dialogOpen: true, selectedAction });
  };

  handleActionError = (dialogError) => {
    this.setState({ dialogError, actionLoading: false });
  };

  // TODO: Action not working.
  handleActionSubmit = async () => {
    const { selectedAction, drawerProvisioner: provisioner } = this.state;
    const url = selectedAction.url.replace('<provisionerId>', provisioner.provisionerId);

    this.setState({ actionLoading: true, dialogError: null });

    await fetch(url, {
      method: selectedAction.method,
      Authorization: `Bearer ${btoa(JSON.stringify(this.props.user.credentials))}`,
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
            onClick={() => this.handleDrawerOpen(provisioner)}
          >
            <InformationVariantIcon size={iconSize} />
          </IconButton>
          <Link
            to={`/provisioners/${provisioner.provisionerId}`}
            title={`Explore worker types for ${provisioner.provisionerId}`}
          >
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
          {drawerProvisioner?.provisionerId}
        </Typography>
        <List>
          <ListItem>
            <ListItemText
              primary="Description"
              secondary={drawerProvisioner?.description ? <Markdown>{drawerProvisioner.description}</Markdown> : 'n/a'}
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Actions"
              secondary={drawerProvisioner?.actions.length ? this.renderActions() : 'n/a'}
            />
          </ListItem>
        </List>
      </div>
    );
  };

  renderActions = () => {
    const { classes } = this.props;
    const { actionLoading, drawerProvisioner: provisioner } = this.state;
    const { actions } = provisioner.actions.filter(({ context }) => context === ACTION_CONTEXT.PROVISIONER);

    if (actions.length) {
      return actions.map((action) => (
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
          variant="contained"
        >
          {action.title}
        </Button>
      ));
    }
  };

  render() {
    const { provisioners } = this.props;
    const query = parse(this.props.location.search.slice(1));
    const { drawerOpen, dialogError, dialogOpen, selectedAction } = this.state;
    const { sortBy, sortDirection } = query.sortBy ? query : { sortBy: null, sortDirection: null };
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
        <Drawer anchor="right" open={drawerOpen} onClose={this.handleDrawerClose}>
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
