import React, { Component, Fragment } from 'react';
import { oneOfType, object, string, func, bool } from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import classNames from 'classnames';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import TextField from '@material-ui/core/TextField';
import Typography from '@material-ui/core/Typography';
import ContentSaveIcon from 'mdi-react/ContentSaveIcon';
import DeleteIcon from 'mdi-react/DeleteIcon';
import LinkIcon from 'mdi-react/LinkIcon';
import Button from '../Button';
import SpeedDial from '../SpeedDial';
import SpeedDialAction from '../SpeedDialAction';
import DialogAction from '../DialogAction';
import { role } from '../../utils/prop-types';
import Link from '../../utils/Link';
import splitLines from '../../utils/splitLines';
import { formatScope, scopeLink } from '../../utils/scopeUtils';

@withStyles(theme => ({
  fab: {
    ...theme.mixins.fab,
  },
  saveRoleSpan: {
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
}))
/** A form to view/edit/create a role */
export default class RoleForm extends Component {
  static propTypes = {
    /** A GraphQL role response. Not needed when creating a new role  */
    role,
    /** Set to `true` when creating a new role. */
    isNewRole: bool,
    /** Callback function fired when a role is created/updated. */
    onRoleSave: func.isRequired,
    /** Callback function fired when a role is deleted. */
    onRoleDelete: func,
    /** If true, form actions will be disabled. */
    loading: bool,
    /** Error to display when an action dialog is open. */
    dialogError: oneOfType([string, object]),
    /**
     * Callback function fired when the DialogAction component throws an error.
     * */
    onDialogActionError: func,
    /**
     * Callback function fired when the DialogAction component runs
     * successfully.
     * */
    onDialogActionComplete: func,
  };

  static defaultProps = {
    isNewRole: false,
    role: null,
    onRoleDelete: null,
    loading: null,
    dialogError: null,
  };

  static getDerivedStateFromProps({ isNewRole, role }, state) {
    if (isNewRole || state.roleId) {
      return null;
    }

    return {
      description: role.description,
      roleId: role.roleId,
      created: role.created,
      lastModified: role.lastModified,
      scopeText: role.scopes.join('\n'),
      expandedScopes: role.expandedScopes,
    };
  }

  state = {
    description: '',
    scopeText: '',
    roleId: '',
    created: null,
    lastModified: null,
    expandedScopes: null,
  };

  handleDeleteRole = () => this.props.onRoleDelete(this.state.roleId);

  handleInputChange = ({ target: { name, value } }) => {
    this.setState({ [name]: value });
  };

  handleSaveRole = () => {
    const { roleId, scopeText, description } = this.state;
    const scopes = splitLines(scopeText);
    const role = {
      scopes,
      description,
    };

    this.props.onRoleSave(role, roleId);
  };

  render() {
    const {
      role,
      classes,
      isNewRole,
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
      roleId,
      created,
      lastModified,
      expandedScopes,
    } = this.state;
    const isRoleDirty =
      isNewRole ||
      description !== role.description ||
      scopeText !== role.scopes.join('\n');

    return (
      <Fragment>
        <List>
          {isNewRole && (
            <ListItem>
              <TextField
                label="Role ID"
                name="roleId"
                onChange={this.handleInputChange}
                fullWidth
                autoFocus
                value={roleId}
              />
            </ListItem>
          )}
          {role && (
            <Fragment>
              <ListItem>
                <ListItemText primary="Role ID" secondary={roleId} />
              </ListItem>
              <ListItem>
                <ListItemText primary="Date Created" secondary={created} />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Date Last Modified"
                  secondary={lastModified}
                />
              </ListItem>
            </Fragment>
          )}
          <ListItem>
            <TextField
              label="Description"
              name="description"
              onChange={this.handleInputChange}
              fullWidth
              multiline
              rows={5}
              value={description}
            />
          </ListItem>
          <ListItem>
            <TextField
              label="Scopes"
              name="scopeText"
              onChange={this.handleInputChange}
              spellCheck={false}
              fullWidth
              multiline
              placeholder={isNewRole ? 'new-scope:for-something:*' : null}
              value={scopeText}
            />
          </ListItem>
          {role && expandedScopes.length ? (
            <Fragment>
              <ListItem>
                <ListItemText
                  primary="Expanded Scopes"
                  secondary={
                    <span>
                      Expanded scopes are determined from the role scopes,
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
        {isNewRole ? (
          <Button
            spanProps={{ className: classes.fab }}
            tooltipProps={{ title: 'Save' }}
            requiresAuth
            disabled={loading || !isRoleDirty}
            variant="round"
            onClick={this.handleSaveRole}
            classes={{ root: classes.saveIcon }}>
            <ContentSaveIcon />
          </Button>
        ) : (
          <Fragment>
            <Button
              spanProps={{
                className: classNames(classes.fab, classes.saveRoleSpan),
              }}
              requiresAuth
              tooltipOpen
              onClick={this.handleSaveRole}
              className={classes.saveIcon}
              variant="round"
              tooltipProps={{ title: 'Save' }}
              disabled={loading || !isRoleDirty}
              classes={{ root: classes.saveIcon }}>
              <ContentSaveIcon />
            </Button>
            <SpeedDial>
              <SpeedDialAction
                requiresAuth
                tooltipOpen
                onClick={onDialogActionOpen}
                icon={<DeleteIcon />}
                tooltipTitle="Delete"
                className={classes.deleteIcon}
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
            onSubmit={this.handleDeleteRole}
            onComplete={onDialogActionComplete}
            onClose={onDialogActionClose}
            onError={onDialogActionError}
            error={dialogError}
            title="Delete Role?"
            body={<Typography>This will delete the {roleId} role.</Typography>}
            confirmText="Delete Role"
          />
        )}
      </Fragment>
    );
  }
}
