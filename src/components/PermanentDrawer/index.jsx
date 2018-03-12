import { PureComponent } from 'react';
import { object, node } from 'prop-types';
import classNames from 'classnames';
import { withStyles } from 'material-ui/styles';
import Drawer from 'material-ui/Drawer';
import AppBar from 'material-ui/AppBar';
import Toolbar from 'material-ui/Toolbar';
import List, { ListItem, ListItemText } from 'material-ui/List';
import { ExpandMore, Person } from 'material-ui-icons';
import Avatar from 'material-ui/Avatar';
import Menu, { MenuItem } from 'material-ui/Menu';
import Typography from 'material-ui/Typography';
import Divider from 'material-ui/Divider';
import DrawerListItem from '../DrawerListItem';
import menuItems from '../../App/menuItems';

const drawerWidth = 240;
const styles = theme => ({
  root: {
    flexGrow: 1
  },
  appFrame: {
    height: '100%',
    zIndex: 1,
    overflow: 'hidden',
    position: 'relative',
    display: 'flex',
    width: '100%'
  },
  appBar: {
    width: `calc(100% - ${drawerWidth}px)`,
    backgroundColor: theme.palette.primary.main
  },
  appBarLeft: {
    marginLeft: drawerWidth
  },
  drawerPaper: {
    position: 'relative',
    width: drawerWidth,
    backgroundColor: theme.palette.secondary.dark,
    color: theme.palette.secondary.contrastText
  },
  toolbar: theme.mixins.toolbar,
  content: {
    flexGrow: 1,
    backgroundColor: theme.palette.background.default,
    padding: theme.spacing.unit * 3
  },
  link: {
    textDecoration: 'none'
  },
  loginMenuItem: {
    color: theme.palette.text.black
  }
});

class PermanentDrawer extends PureComponent {
  static propTypes = {
    classes: object.isRequired,
    children: node
  };

  static defaultProps = {
    children: null
  };

  state = {
    anchorEl: null
  };

  handleAvatarClick = e => this.setState({ anchorEl: e.currentTarget });

  handleMenuClose = () => this.setState({ anchorEl: null });

  render() {
    const { classes, children } = this.props;
    const { anchorEl } = this.state;

    return (
      <div className={classes.root}>
        <div className={classes.appFrame}>
          <AppBar
            position="absolute"
            className={classNames(classes.appBar, classes.appBarLeft)}>
            <Toolbar />
          </AppBar>

          <Drawer
            variant="permanent"
            classes={{
              paper: classes.drawerPaper
            }}
            anchor="left"
            color="secondary">
            <div className={classes.toolbar}>
              <List>
                <ListItem>
                  <ListItemText
                    primary={
                      <Typography variant="title" noWrap component="span">
                        Taskcluster
                      </Typography>
                    }
                  />
                </ListItem>
              </List>
            </div>
            <Divider />
            <Menu
              id="login-menu"
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={this.handleMenuClose}>
              <MenuItem className={classes.loginMenuItem}>
                Manage Credentials
              </MenuItem>
              <MenuItem className={classes.loginMenuItem}>Logout</MenuItem>
            </Menu>
            <List
              aria-owns={anchorEl ? 'login-menu' : null}
              aria-haspopup="true"
              onClick={this.handleAvatarClick}>
              <ListItem>
                <Avatar>
                  <Person />
                </Avatar>
                <ListItemText
                  primary="Hassan Ali"
                  secondary="haali@mozilla.com"
                />
                <ExpandMore />
              </ListItem>
            </List>
            <Divider />
            <List>
              {menuItems.map(({ key, ...item }) => (
                <DrawerListItem key={key} {...item} />
              ))}
            </List>
          </Drawer>

          <main className={classes.content}>
            <div className={classes.toolbar} />
            {children}
          </main>
        </div>
      </div>
    );
  }
}

export default withStyles(styles)(PermanentDrawer);
