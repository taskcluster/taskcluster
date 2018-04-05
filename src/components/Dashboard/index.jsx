import { Component } from 'react';
import { bool, func, node, string } from 'prop-types';
import { Link } from 'react-router-dom';
import classNames from 'classnames';
import { withStyles } from 'material-ui/styles';
import Drawer from 'material-ui/Drawer';
import AppBar from 'material-ui/AppBar';
import Toolbar from 'material-ui/Toolbar';
import Typography from 'material-ui/Typography';
import IconButton from 'material-ui/IconButton';
import Hidden from 'material-ui/Hidden';
import Divider from 'material-ui/Divider';
import MenuIcon from 'mdi-react/MenuIcon';
import PageTitle from '../PageTitle';
import ErrorPanel from '../ErrorPanel';
import UserMenu from './UserMenu';
import SidebarList from './SidebarList';
import { user } from '../../utils/prop-types';

@withStyles(
  theme => ({
    root: {
      flexGrow: 1,
      minHeight: '100vh',
      zIndex: 1,
      overflow: 'hidden',
      position: 'relative',
      display: 'flex',
      width: '100vw',
    },
    appBar: {
      position: 'fixed',
      backgroundColor: theme.palette.secondary.main,
      zIndex: theme.zIndex.drawer + 1,
      [theme.breakpoints.up('md')]: {
        width: `calc(100% - ${theme.drawerWidth}px)`,
      },
    },
    appBarTitle: {
      fontFamily: 'Roboto300',
      flex: 1,
    },
    navIconHide: {
      [theme.breakpoints.up('md')]: {
        display: 'none',
      },
    },
    toolbar: {
      ...theme.mixins.toolbar,
      paddingLeft: theme.spacing.double,
      display: 'flex',
      flexGrow: 1,
      flexDirection: 'row',
      alignItems: 'center',
    },
    drawerPaper: {
      color: theme.palette.secondary.contrastText,
      width: theme.drawerWidth,
      [theme.breakpoints.up('md')]: {
        position: 'fixed',
      },
      borderRight: 0,
    },
    title: {
      textDecoration: 'none',
      color: theme.palette.common.white,
    },
    contentPadding: {
      paddingTop: theme.spacing.triple,
      paddingLeft: theme.spacing.triple,
      paddingRight: theme.spacing.triple,
      paddingBottom: theme.spacing.triple * 4,
    },
    content: {
      flexGrow: 1,
      backgroundColor: theme.palette.background,
      overflowY: 'auto',
      minHeight: 'calc(100vh - 56px)',
      marginTop: 56,
      [theme.breakpoints.up('sm')]: {
        minHeight: 'calc(100vh - 64px)',
        marginTop: 64,
      },
      [theme.breakpoints.up('md')]: {
        marginLeft: theme.drawerWidth,
        width: `calc(100% - ${theme.drawerWidth}px)`,
      },
    },
  }),
  { withTheme: true }
)
export default class Dashboard extends Component {
  static propTypes = {
    children: node.isRequired,
    onSignIn: func.isRequired,
    onSignOut: func.isRequired,
    title: string,
    disablePadding: bool,
    search: node,
    user,
  };

  static defaultProps = {
    title: '',
    user: null,
    disablePadding: false,
    search: null,
  };

  state = {
    mobileOpen: false,
    error: null,
  };

  componentDidCatch(error) {
    this.setState({ error });
  }

  handleDrawerToggle = () => {
    this.setState({ mobileOpen: !this.state.mobileOpen });
  };

  render() {
    const {
      classes,
      className,
      children,
      disablePadding,
      theme,
      title,
      user,
      onSignIn,
      onSignOut,
      search,
      ...props
    } = this.props;
    const { error, mobileOpen } = this.state;
    const drawer = (
      <div>
        <div className={classes.toolbar}>
          <IconButton
            color="inherit"
            aria-label="close drawer"
            onClick={this.handleDrawerToggle}
            className={classes.navIconHide}>
            <MenuIcon />
          </IconButton>
          <Typography
            component={Link}
            to="/"
            variant="title"
            noWrap
            className={classes.title}>
            {process.env.APPLICATION_NAME}
          </Typography>
        </div>
        <Divider />
        <UserMenu user={user} onSignIn={onSignIn} onSignOut={onSignOut} />
        <Divider />
        <SidebarList />
      </div>
    );

    return (
      <div className={classes.root}>
        <PageTitle>{title}</PageTitle>
        <AppBar className={classes.appBar}>
          <Toolbar>
            <IconButton
              color="inherit"
              aria-label="open drawer"
              onClick={this.handleDrawerToggle}
              className={classes.navIconHide}>
              <MenuIcon />
            </IconButton>
            <Typography variant="title" noWrap className={classes.appBarTitle}>
              {title}
            </Typography>
            {search}
          </Toolbar>
        </AppBar>
        <Hidden mdUp>
          <Drawer
            variant="temporary"
            anchor={theme.direction === 'rtl' ? 'right' : 'left'}
            open={mobileOpen}
            onClose={this.handleDrawerToggle}
            classes={{
              paper: classes.drawerPaper,
            }}
            ModalProps={{
              keepMounted: true,
            }}>
            {drawer}
          </Drawer>
        </Hidden>
        <Hidden smDown implementation="css">
          <Drawer
            variant="permanent"
            open
            PaperProps={{
              elevation: 2,
            }}
            classes={{
              paper: classes.drawerPaper,
            }}>
            {drawer}
          </Drawer>
        </Hidden>
        <main
          className={classNames(
            classes.content,
            {
              [classes.contentPadding]: !disablePadding,
            },
            className
          )}
          {...props}>
          {error ? <ErrorPanel error={error} /> : children}
        </main>
      </div>
    );
  }
}
