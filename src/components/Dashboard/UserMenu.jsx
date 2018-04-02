import { Component, Fragment } from 'react';
import { func, shape, string } from 'prop-types';
import { withStyles } from 'material-ui/styles';
import Menu, { MenuItem } from 'material-ui/Menu';
import List, { ListItem, ListItemText } from 'material-ui/List';
import Avatar from 'material-ui/Avatar';
import AccountCircleIcon from 'mdi-react/AccountCircleIcon';

@withStyles(theme => ({
  avatar: {
    backgroundColor: theme.palette.secondary.main,
  },
  userMenu: {
    [theme.breakpoints.up('sm')]: {
      padding: `${theme.spacing.unit / 2}px ${theme.spacing.double}px`,
    },
  },
}))
export default class UserMenu extends Component {
  static propTypes = {
    onSignIn: func.isRequired,
    onSignOut: func.isRequired,
    user: shape({
      name: string,
      nickname: string,
      picture: string,
      sub: string,
    }),
  };

  static defaultProps = {
    user: null,
  };

  state = {
    anchorEl: null,
  };

  handleMenuClick = e => {
    this.setState({ anchorEl: e.currentTarget });
  };

  handleMenuClose = () => {
    this.setState({ anchorEl: null });
  };

  handleClickSignIn = () => {
    this.props.onSignIn();
  };

  handleClickSignOut = () => {
    this.handleMenuClose();
    this.props.onSignOut();
  };

  render() {
    const { classes, user } = this.props;
    const { anchorEl } = this.state;

    if (!user) {
      return (
        <List component="nav">
          <ListItem
            button
            aria-haspopup="true"
            aria-controls="user-menu"
            aria-label="user menu"
            onClick={this.handleClickSignIn}>
            <AccountCircleIcon />&nbsp;&nbsp;Sign In
          </ListItem>
        </List>
      );
    }

    return (
      <Fragment>
        <List component="nav">
          <ListItem
            className={classes.userMenu}
            button
            aria-haspopup="true"
            aria-controls="user-menu"
            aria-label="user menu"
            onClick={this.handleMenuClick}>
            {user.picture ? (
              <Avatar alt={`${user.name}: ${user.sub}`} src={user.picture} />
            ) : (
              <Avatar alt={`${user.name}: ${user.sub}`}>
                {(user.nickname || user.name)[0]}
              </Avatar>
            )}
            <ListItemText primary={user.nickname || user.name} />
          </ListItem>
        </List>
        <Menu
          id="user-menu"
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={this.handleClose}>
          <MenuItem onClick={this.handleMenuClose}>Manage Credentials</MenuItem>
          <MenuItem onClick={this.handleClickSignOut}>Sign Out</MenuItem>
        </Menu>
      </Fragment>
    );
  }
}
