import { Component, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { bool } from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import TextField from '@material-ui/core/TextField';
import Tooltip from '@material-ui/core/Tooltip';
import ContentSaveIcon from 'mdi-react/ContentSaveIcon';
import LinkIcon from 'mdi-react/LinkIcon';
import Button from '../Button';
import { role } from '../../utils/prop-types';
// import splitLines from '../../utils/splitLines';

@withStyles(theme => ({
  saveButton: {
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
}))
/** A form to view/edit/create a role */
export default class RoleForm extends Component {
  static propTypes = {
    /** A GraphQL role response. Not needed when creating a new role  */
    role,
    /** Set to `true` when creating a new role. */
    isNewRole: bool,
  };

  static defaultProps = {
    isNewRole: false,
    role: null,
  };

  state = {
    description: '',
    scopeText: '',
    roleId: '',
    created: null,
    lastModified: null,
    expandedScopes: null,
  };

  static getDerivedStateFromProps({ isNewRole, role }) {
    if (isNewRole) {
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

  handleInputChange = ({ target: { name, value } }) => {
    this.setState({ [name]: value });
  };

  // TODO: Handle save role request
  handleSaveRole = () => {
    // const { scopeText } = this.state;
    // const scopes = splitLines(scopeText);
  };

  render() {
    const { role, classes, isNewRole } = this.props;
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
        <Tooltip title="Save">
          <Button
            requiresAuth
            variant="fab"
            onClick={this.handleSaveRole}
            classes={{ root: classes.saveIcon }}
            className={classes.saveButton}>
            <ContentSaveIcon />
          </Button>
        </Tooltip>
      </Fragment>
    );
  }
}
