import React, { Component, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { bool, func } from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import TextField from '@material-ui/core/TextField';
import ContentSaveIcon from 'mdi-react/ContentSaveIcon';
import DeleteIcon from 'mdi-react/DeleteIcon';
import LinkIcon from 'mdi-react/LinkIcon';
import Button from '../Button';
import SpeedDial from '../SpeedDial';
import SpeedDialAction from '../SpeedDialAction';
import { role } from '../../utils/prop-types';
import splitLines from '../../utils/splitLines';
import withAlertOnClose from '../../utils/withAlertOnClose';

@withAlertOnClose
@withStyles(theme => ({
  fab: {
    ...theme.mixins.fab,
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
  static defaultProps = {
    isNewRole: false,
    role: null,
    onDeleteRole: null,
    loading: null,
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

  static propTypes = {
    /** A GraphQL role response. Not needed when creating a new role  */
    role,
    /** Set to `true` when creating a new role. */
    isNewRole: bool,
    /** Callback function fired when a role is created/updated. */
    onSaveRole: func.isRequired,
    /** Callback function fired when a role is deleted. */
    onDeleteRole: func,
    /** If true, form actions will be disabled. */
    loading: bool,
  };

  state = {
    description: '',
    scopeText: '',
    roleId: '',
    created: null,
    lastModified: null,
    expandedScopes: null,
  };

  handleDeleteRole = () => {
    this.props.onDeleteRole(this.state.roleId);
  };

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

    this.props.onSaveRole(role, roleId);
  };

  render() {
    const { role, classes, isNewRole, loading } = this.props;
    const {
      description,
      scopeText,
      roleId,
      created,
      lastModified,
      expandedScopes,
    } = this.state;

    return (
      <Fragment>
        <List>
          {isNewRole ? (
            <ListItem>
              <TextField
                label="Role ID"
                name="roleId"
                onChange={this.handleInputChange}
                fullWidth
                value={roleId}
              />
            </ListItem>
          ) : null}
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
              fullWidth
              multiline
              rows={5}
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
                          to={`/auth/scopes/${encodeURIComponent(scope)}`}
                          className={classes.listItemButton}>
                          <ListItemText secondary={<code>{scope}</code>} />
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
            disabled={loading}
            variant="round"
            onClick={this.handleSaveRole}
            classes={{ root: classes.saveIcon }}>
            <ContentSaveIcon />
          </Button>
        ) : (
          <SpeedDial>
            <SpeedDialAction
              requiresAuth
              tooltipOpen
              icon={<ContentSaveIcon />}
              onClick={this.handleSaveRole}
              className={classes.saveIcon}
              tooltipTitle="Save"
              ButtonProps={{ disabled: loading }}
            />
            <SpeedDialAction
              requiresAuth
              tooltipOpen
              icon={<DeleteIcon />}
              onClick={this.handleDeleteRole}
              tooltipTitle="Delete"
              className={classes.deleteIcon}
              ButtonProps={{
                disabled: loading,
              }}
            />
          </SpeedDial>
        )}
      </Fragment>
    );
  }
}
