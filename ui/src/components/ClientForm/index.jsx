import React, { Component, Fragment } from 'react';
import { oneOfType, object, string, func, bool } from 'prop-types';
import { parse } from 'qs';
import { addYears } from 'date-fns';
import { withRouter } from 'react-router-dom';
import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import classNames from 'classnames';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import TextField from '@material-ui/core/TextField';
import Switch from '@material-ui/core/Switch';
import FormGroup from '@material-ui/core/FormGroup';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import MarkdownTextArea from '@mozilla-frontend-infra/components/MarkdownTextArea';
import ContentSaveIcon from 'mdi-react/ContentSaveIcon';
import CancelIcon from 'mdi-react/CancelIcon';
import DeleteIcon from 'mdi-react/DeleteIcon';
import LinkIcon from 'mdi-react/LinkIcon';
import PowerIcon from 'mdi-react/PowerIcon';
import LockResetIcon from 'mdi-react/LockResetIcon';
import SpeedDial from '../SpeedDial';
import SpeedDialAction from '../SpeedDialAction';
import DialogAction from '../DialogAction';
import DateDistance from '../DateDistance';
import DatePicker from '../DatePicker';
import Button from '../Button';
import { client } from '../../utils/prop-types';
import splitLines from '../../utils/splitLines';
import Link from '../../utils/Link';
import { formatScope, scopeLink } from '../../utils/scopeUtils';

@withRouter
@withStyles(theme => ({
  fab: {
    ...theme.mixins.fab,
  },
  saveClientSpan: {
    position: 'fixed',
    bottom: theme.spacing.double,
    right: theme.spacing.unit * 11,
  },
  expandedScopesListItem: {
    paddingTop: 0,
    paddingBottom: 0,
  },
  expandedScopesWrapper: {
    paddingRight: 0,
  },
  listItemButton: {
    ...theme.mixins.listItemButton,
  },
  saveIcon: {
    ...theme.mixins.successIcon,
  },
  deleteIcon: {
    ...theme.mixins.errorIcon,
  },
  disableIcon: {
    ...theme.mixins.warningIcon,
  },
  enableIcon: {
    ...theme.mixins.successIcon,
  },
}))
/** A form to view/edit/create a client */
export default class ClientForm extends Component {
  static propTypes = {
    /** A GraphQL client response. Not needed when creating a new client  */
    client,
    /** Set to `true` when creating a new client. */
    isNewClient: bool,
    /** Callback function fired when a client is created/updated. */
    onSaveClient: func.isRequired,
    /** Callback function fired when a client is deleted. */
    onDeleteClient: func,
    /** Callback function fired when a client is disabled. */
    onDisableClient: func,
    /** Callback function fired when a client is enabled. */
    onEnableClient: func,
    /** Callback function fired when a client resets its access token. */
    onResetAccessToken: func,
    /** If true, form actions will be disabled. */
    loading: bool,
    /** Error to display when an action dialog is open. */
    dialogError: oneOfType([string, object]),
    /**
     * Callback function fired when the DialogAction component throws an error.
     * Required when viewing an existent client.
     * */
    onDialogActionError: func,
    /**
     * Callback function fired when the DialogAction component runs
     * successfully. Required when viewing an existent client.
     * */
    onDialogActionComplete: func,
    /**
     * Callback function fired when the dialog should open.
     * Required when viewing an existent client.
     */
    onDialogActionOpen: func,
    /**
     * Callback function fired when the dialog should close.
     * Required when viewing an existent client.
     */
    onDialogActionClose: func,
    /** Initial client to use for third party login */
    initialThirdPartyClient: client,
  };

  static defaultProps = {
    isNewClient: false,
    client: null,
    loading: false,
    onDeleteClient: null,
    onDisableClient: null,
    onEnableClient: null,
    onResetAccessToken: null,
    dialogError: null,
    onDialogActionError: null,
    onDialogActionComplete: null,
    onDialogActionOpen: null,
    onDialogActionClose: null,
    initialThirdPartyClient: {},
  };

  static getDerivedStateFromProps({ isNewClient, client }, state) {
    if (isNewClient || (state.clientId && state.prevClient === client)) {
      return null;
    }

    return {
      description: client.description,
      clientId: client.clientId,
      created: client.created,
      lastModified: client.lastModified,
      lastDateUsed: client.lastDateUsed,
      lastRotated: client.lastRotated,
      expires: client.expires,
      deleteOnExpiration: client.deleteOnExpiration,
      scopeText: client.scopes.join('\n'),
      expandedScopes: client.expandedScopes,
      disabled: client.disabled,
      prevClient: client,
    };
  }

  query = parse(this.props.location.search.slice(1));

  state = {
    description: this.props.initialThirdPartyClient.description || '',
    scopeText: this.props.initialThirdPartyClient.scopes
      ? this.props.initialThirdPartyClient.scopes.join('\n')
      : '',
    clientId: this.props.initialThirdPartyClient.clientId || '',
    created: null,
    lastModified: null,
    lastDateUsed: null,
    lastRotated: null,
    expires: this.props.initialThirdPartyClient.expires
      ? new Date(this.props.initialThirdPartyClient.expires)
      : addYears(new Date(), 1000),
    deleteOnExpiration: true,
    expandedScopes: null,
    disabled: null,
    // eslint-disable-next-line react/no-unused-state
    prevClient: null,
  };

  handleDeleteClient = () => this.props.onDeleteClient(this.state.clientId);

  handleDeleteOnExpirationChange = () => {
    this.setState({ deleteOnExpiration: !this.state.deleteOnExpiration });
  };

  handleDisableClient = () => {
    this.props.onDisableClient(this.state.clientId);
  };

  handleEnableClient = () => {
    this.props.onEnableClient(this.state.clientId);
  };

  handleExpirationChange = expires => {
    this.setState({
      expires,
    });
  };

  handleInputChange = ({ target: { name, value } }) => {
    this.setState({ [name]: value });
  };

  handleResetAccessToken = () => {
    this.props.onResetAccessToken(this.state.clientId);
  };

  handleSaveClient = () => {
    const {
      clientId,
      scopeText,
      description,
      expires,
      deleteOnExpiration,
    } = this.state;
    const scopes = splitLines(scopeText);
    const client = {
      expires,
      description,
      deleteOnExpiration,
      scopes,
    };

    this.props.onSaveClient(client, clientId);
  };

  render() {
    const {
      client,
      classes,
      isNewClient,
      loading,
      dialogOpen,
      dialogError,
      onDialogActionClose,
      onDialogActionError,
      onDialogActionOpen,
      onDialogActionComplete,
    } = this.props;
    const {
      description,
      scopeText,
      clientId,
      created,
      lastModified,
      lastDateUsed,
      lastRotated,
      expires,
      deleteOnExpiration,
      expandedScopes,
      disabled,
    } = this.state;
    const isClientDirty =
      isNewClient ||
      description !== client.description ||
      expires !== client.expires ||
      scopeText !== client.scopes.join('\n');

    return (
      <Fragment>
        <List>
          <ListItem>
            <FormGroup row>
              <FormControlLabel
                control={
                  <Switch
                    checked={deleteOnExpiration}
                    onChange={this.handleDeleteOnExpirationChange}
                  />
                }
                label="Delete on Expiration"
              />
            </FormGroup>
          </ListItem>
          {isNewClient && (
            <ListItem>
              <TextField
                label="Client ID"
                name="clientId"
                onChange={this.handleInputChange}
                fullWidth
                autoFocus
                value={clientId}
              />
            </ListItem>
          )}
          {client && (
            <Fragment>
              <ListItem>
                <ListItemText primary="Client ID" secondary={clientId} />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Date Created"
                  secondary={<DateDistance from={created} />}
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Date Last Modified"
                  secondary={<DateDistance from={lastModified} />}
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Date Last Used"
                  secondary={<DateDistance from={lastDateUsed} />}
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Date Last Rotated"
                  secondary={<DateDistance from={lastRotated} />}
                />
              </ListItem>
            </Fragment>
          )}
          <ListItem>
            <ListItemText
              disableTypography
              primary={
                <Typography component="h3" variant="subtitle1">
                  Expires
                </Typography>
              }
              secondary={
                <DatePicker
                  value={expires}
                  onChange={this.handleExpirationChange}
                  format="yyyy/MM/dd"
                  maxDate={addYears(new Date(), 1001)}
                />
              }
            />
          </ListItem>
          <ListItem>
            <MarkdownTextArea
              onChange={this.handleInputChange}
              name="description"
              value={description}
              placeholder="Client description (markdown)"
              defaultTabIndex={isNewClient ? 0 : 1}
            />
          </ListItem>
          <ListItem>
            <TextField
              label="Scopes"
              name="scopeText"
              helperText="Enter each scope on its own line"
              onChange={this.handleInputChange}
              fullWidth
              multiline
              spellCheck={false}
              placeholder={isNewClient ? 'new-scope:for-something:*' : null}
              value={scopeText}
            />
          </ListItem>
          {client && expandedScopes.length ? (
            <Fragment>
              <ListItem>
                <ListItemText
                  primary="Expanded Scopes"
                  secondary={
                    <span>
                      Expanded scopes are determined from the client scopes,
                      expanding roles for scopes beginning with{' '}
                      <code>assume:</code>.
                    </span>
                  }
                />
              </ListItem>
              <ListItem classes={{ root: classes.expandedScopesListItem }}>
                <ListItemText
                  disableTypography
                  className={classes.expandedScopesWrapper}
                  secondary={
                    <List dense>
                      {expandedScopes.map(scope => (
                        <ListItem
                          key={scope}
                          button
                          component={Link}
                          to={scopeLink(scope)}
                          className={classes.listItemButton}>
                          <ListItemText
                            disableTypography
                            secondary={
                              <Typography>
                                <code
                                  // eslint-disable-next-line react/no-danger
                                  dangerouslySetInnerHTML={{
                                    __html: formatScope(scope),
                                  }}
                                />
                              </Typography>
                            }
                          />
                          <LinkIcon />
                        </ListItem>
                      ))}
                    </List>
                  }
                />
              </ListItem>
            </Fragment>
          ) : null}
        </List>
        {isNewClient ? (
          <Button
            spanProps={{ className: classes.fab }}
            tooltipProps={{ title: 'Save' }}
            requiresAuth
            disabled={loading || !isClientDirty}
            variant="round"
            onClick={this.handleSaveClient}
            classes={{ root: classes.saveIcon }}>
            <ContentSaveIcon />
          </Button>
        ) : (
          <Fragment>
            <Button
              requiresAuth
              tooltipOpen
              variant="round"
              onClick={this.handleSaveClient}
              spanProps={{
                className: classNames(classes.fab, classes.saveClientSpan),
              }}
              tooltipProps={{ title: 'Save' }}
              disabled={loading || !isClientDirty}
              classes={{ root: classes.saveIcon }}>
              <ContentSaveIcon />
            </Button>
            <SpeedDial>
              <SpeedDialAction
                requiresAuth
                tooltipOpen
                icon={<DeleteIcon />}
                onClick={onDialogActionOpen}
                className={classes.deleteIcon}
                tooltipTitle="Delete"
                ButtonProps={{ disabled: loading }}
              />
              <SpeedDialAction
                requiresAuth
                tooltipOpen
                icon={disabled ? <PowerIcon /> : <CancelIcon />}
                onClick={
                  disabled ? this.handleEnableClient : this.handleDisableClient
                }
                tooltipTitle={disabled ? 'Enable' : 'Disable'}
                className={disabled ? classes.enableIcon : classes.disableIcon}
                ButtonProps={{
                  disabled: loading,
                }}
              />
              <SpeedDialAction
                requiresAuth
                tooltipOpen
                icon={<LockResetIcon />}
                onClick={this.handleResetAccessToken}
                tooltipTitle="Reset Access Token"
                ButtonProps={{
                  disabled: loading,
                }}
              />
            </SpeedDial>
          </Fragment>
        )}
        {dialogOpen && (
          <DialogAction
            open={dialogOpen}
            onSubmit={this.handleDeleteClient}
            onComplete={onDialogActionComplete}
            onClose={onDialogActionClose}
            onError={onDialogActionError}
            error={dialogError}
            title="Delete Client?"
            body={
              <Typography>This will delete the {clientId} client.</Typography>
            }
            confirmText="Delete Client"
          />
        )}
      </Fragment>
    );
  }
}
