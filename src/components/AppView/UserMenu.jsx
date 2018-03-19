import { Component, Fragment } from 'react';
import { withStyles } from 'material-ui/styles';
import Menu, { MenuItem } from 'material-ui/Menu';
import List, { ListItem, ListItemText } from 'material-ui/List';
import Avatar from 'material-ui/Avatar';
import AccountCircleIcon from 'mdi-react/AccountCircleIcon';
// import ChevronDownIcon from 'mdi-react/ChevronDownIcon';

@withStyles(theme => ({
  avatar: {
    backgroundColor: theme.palette.secondary.main,
  },
}))
export default class UserMenu extends Component {
  state = {
    anchorEl: null,
  };

  handleMenuClick = e => this.setState({ anchorEl: e.currentTarget });

  handleMenuClose = () => this.setState({ anchorEl: null });

  render() {
    const { classes } = this.props;
    const { anchorEl } = this.state;

    return (
      <Fragment>
        <List component="nav">
          <ListItem
            button
            aria-haspopup="true"
            aria-controls="user-menu"
            aria-label="user menu"
            onClick={this.handleMenuClick}>
            <Avatar className={classes.avatar}>
              <AccountCircleIcon />
            </Avatar>
            <ListItemText primary="Hassan Ali" secondary="haali@mozilla.com" />
          </ListItem>
        </List>
        <Menu
          id="user-menu"
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={this.handleClose}>
          <MenuItem onClick={this.handleMenuClose}>Manage Credentials</MenuItem>
          <MenuItem onClick={this.handleMenuClose}>Logout</MenuItem>
        </Menu>
        <Menu
          id="login-menu"
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={this.handleMenuClose}>
          <MenuItem onClick={this.handleMenuClose}>Manage Credentials</MenuItem>
          <MenuItem onClick={this.handleMenuClose}>Logout</MenuItem>
        </Menu>
      </Fragment>
    );
  }
}
