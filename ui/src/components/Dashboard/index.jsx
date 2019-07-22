import React, { Component, Fragment } from 'react';
import { bool, node, string } from 'prop-types';
import { withRouter } from 'react-router-dom';
import classNames from 'classnames';
import { title as makeTitle } from 'change-case';
import { withStyles } from '@material-ui/core/styles';
import Drawer from '@material-ui/core/Drawer';
import AppBar from '@material-ui/core/AppBar';
import Toolbar from '@material-ui/core/Toolbar';
import IconButton from '@material-ui/core/IconButton';
import withWidth from '@material-ui/core/withWidth';
import Divider from '@material-ui/core/Divider';
import Tooltip from '@material-ui/core/Tooltip';
import Typography from '@material-ui/core/Typography';
import MenuIcon from 'mdi-react/MenuIcon';
import CloseIcon from 'mdi-react/CloseIcon';
import HelpIcon from 'mdi-react/HelpIcon';
import LightBulbOn from 'mdi-react/LightbulbOnIcon';
import BookOpenPageVariantIcon from 'mdi-react/BookOpenPageVariantIcon';
import LightBulbOnOutline from 'mdi-react/LightbulbOnOutlineIcon';
import PageTitle from '../PageTitle';
import Helmet from '../Helmet';
import UserMenu from '../UserMenu';
import SidebarList from './SidebarList';
import {
  THEME,
  DOCS_PATH_PREFIX,
  CONTENT_MAX_WIDTH,
} from '../../utils/constants';
import { withThemeToggler } from '../../utils/ToggleTheme';
import Link from '../../utils/Link';
import Logo from '../../images/brandLogo.png';
import ErrorPanel from '../ErrorPanel';
import DocsSidebarList from './DocsSidebarList';
import SkipNavigation from '../SkipNavigation';

@withRouter
@withWidth()
@withStyles(
  theme => ({
    root: {
      flexGrow: 1,
      justifyContent: 'center',
      minHeight: '100vh',
      zIndex: 1,
      overflow: 'hidden',
      position: 'relative',
      display: 'flex',
      width: '100%',
    },
    appBar: {
      position: 'fixed',
      backgroundColor: theme.palette.secondary.dark,
      zIndex: theme.zIndex.drawer + 1,
    },
    docsAppBar: {
      [theme.breakpoints.up('md')]: {
        width: `calc(100% - ${theme.docsDrawerWidth}px)`,
      },
    },
    appBarTitle: {
      marginLeft: theme.spacing.unit,
      fontFamily: 'Roboto300',
      flex: 1,
      color: THEME.PRIMARY_TEXT_DARK,
    },
    toolbar: {
      ...theme.mixins.toolbar,
      paddingLeft: theme.spacing.double,
      paddingRight: theme.spacing.double,
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
      backgroundColor: theme.palette.primary.main,
    },
    docsDrawerPaper: {
      width: theme.docsDrawerWidth,
    },
    helpDrawerPaper: {
      width: '40vw',
      [theme.breakpoints.down('sm')]: {
        width: '90vw',
      },
      backgroundColor: theme.palette.primary.main,
      padding: theme.spacing.triple,
    },
    title: {
      textDecoration: 'none',
      color: theme.palette.text.primary,
      width: '100%',
    },
    contentPadding: {
      paddingTop: theme.spacing.triple,
      paddingLeft: theme.spacing.triple,
      paddingRight: theme.spacing.triple,
      paddingBottom: theme.spacing.triple * 4,
    },
    logoStyle: {
      paddingRight: theme.spacing.double,
    },
    content: {
      maxWidth: CONTENT_MAX_WIDTH,
      flexGrow: 1,
      backgroundColor: theme.palette.background,
      overflowY: 'auto',
      minHeight: 'calc(100vh - 56px)',
      marginTop: 56,
      [theme.breakpoints.up('sm')]: {
        minHeight: 'calc(100vh - 64px)',
        marginTop: 64,
      },
    },
    docsContent: {
      position: 'relative',
      [theme.breakpoints.up('md')]: {
        marginLeft: theme.docsDrawerWidth,
        width: `calc(100% - ${theme.docsDrawerWidth}px)`,
      },
      maxWidth: '60em',
    },
    leftAppBarButton: {
      marginLeft: theme.spacing.unit,
    },
    appIcon: {
      fill: theme.palette.common.white,
    },
    helpCloseIcon: {
      position: 'absolute',
      top: theme.spacing.unit,
      right: theme.spacing.unit,
    },
    deploymentVersion: {
      padding: theme.spacing.unit,
    },
    nav: {
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      justifyContent: 'space-between',
    },
  }),
  { withTheme: true }
)
@withThemeToggler
/**
 * Render the layout for application-based views.
 */
export default class Dashboard extends Component {
  static defaultProps = {
    title: '',
    disablePadding: false,
    search: null,
    helpView: null,
    docs: false,
  };

  static propTypes = {
    /**
     * The content to render within the main view body.
     */
    children: node.isRequired,
    /**
     * An optional title to display in the title bar and app bar.
     */
    title: string,
    /**
     * Disable padding of the main content. Useful for expanding content to the
     * full bounds of the content area.
     */
    disablePadding: bool,
    /**
     * Render elements in the app bar for searching purposes.
     */
    search: node,
    /**
     * Each page could contain important information for the new user
     * of a particular view, but often doesn't warrant needing to
     * be shown every time.
     */
    helpView: node,
    /**
     * If true, the documentation table of content will be displayed.
     */
    docs: bool,
  };

  static getDerivedStateFromError(error) {
    return { error };
  }

  state = {
    navOpen: false,
    showHelpView: false,
    error: null,
    deploymentVersion: null,
  };

  componentDidMount() {
    const deploymentVersion = this.getDeploymentVersion();

    this.setState({ deploymentVersion });
  }

  getDeploymentVersion() {
    const importer = require.context('../../../..', false, /version\.json/);
    const file = importer.keys()[0];

    return file ? importer(file).version : null;
  }

  handleDrawerToggle = () => {
    this.setState({ navOpen: !this.state.navOpen });
  };

  handleHelpViewToggle = () => {
    this.setState({ showHelpView: !this.state.showHelpView });
  };

  render() {
    const {
      classes,
      className,
      children,
      disablePadding,
      theme,
      title,
      search,
      helpView,
      onToggleTheme,
      docs,
      history,
      width,
      staticContext: _,
      ...props
    } = this.props;
    const { error, navOpen, showHelpView, deploymentVersion } = this.state;
    const drawer = (
      <nav className={classes.nav}>
        <div>
          <div
            {...!process.env.DOCS_ONLY && {
              component: Link,
              to: '/',
            }}
            className={classes.toolbar}>
            <img
              className={classes.logoStyle}
              height={30}
              alt="logo"
              src={Logo}
            />
            <Typography
              {...!process.env.DOCS_ONLY && {
                component: Link,
                to: '/',
              }}
              variant="h6"
              noWrap
              className={classes.title}>
              {process.env.APPLICATION_NAME}
            </Typography>
          </div>
          <Divider />
          <UserMenu />
          <Divider />
          {docs ? <DocsSidebarList /> : <SidebarList />}
        </div>
        {deploymentVersion && (
          <Typography
            className={classes.deploymentVersion}
            variant="caption"
            noWrap>
            {deploymentVersion}
          </Typography>
        )}
      </nav>
    );
    const isDocs = history.location.pathname.startsWith(DOCS_PATH_PREFIX);
    const isMobileView = width === 'sm' || width === 'xs';
    const pageTitle = makeTitle(title);

    return (
      <div className={classes.root}>
        <Helmet />
        <PageTitle>{pageTitle}</PageTitle>
        <AppBar
          className={classNames(classes.appBar, {
            [classes.docsAppBar]: isDocs,
          })}>
          <Toolbar>
            <SkipNavigation selector="main" />
            {(!isDocs || (isDocs && isMobileView)) && (
              <IconButton
                color="inherit"
                aria-label="toggle drawer"
                onClick={this.handleDrawerToggle}
                className={classes.navIconHide}>
                <MenuIcon className={classes.appIcon} />
              </IconButton>
            )}
            <Typography variant="h6" noWrap className={classes.appBarTitle}>
              {pageTitle}
            </Typography>
            {search}
            <Tooltip placement="bottom" title="Toggle light/dark theme">
              <IconButton
                className={classes.leftAppBarButton}
                onClick={onToggleTheme}>
                {theme.palette.type === 'dark' ? (
                  <LightBulbOn className={classes.appIcon} />
                ) : (
                  <LightBulbOnOutline className={classes.appIcon} />
                )}
              </IconButton>
            </Tooltip>
            <Tooltip placement="bottom" title="Documentation">
              <IconButton component={Link} to={DOCS_PATH_PREFIX}>
                <BookOpenPageVariantIcon className={classes.appIcon} />
              </IconButton>
            </Tooltip>
            {helpView && (
              <Tooltip placement="bottom" title="Page Information">
                <IconButton onClick={this.handleHelpViewToggle}>
                  <HelpIcon className={classes.appIcon} />
                </IconButton>
              </Tooltip>
            )}
            <UserMenu appBar />
          </Toolbar>
        </AppBar>
        <Drawer
          {...(isDocs && !isMobileView
            ? {
                variant: 'permanent',
              }
            : {
                variant: 'temporary',
                open: navOpen,
                onClose: this.handleDrawerToggle,
              })}
          anchor={theme.direction === 'rtl' ? 'right' : 'left'}
          PaperProps={{
            elevation: 2,
          }}
          ModalProps={{
            keepMounted: true,
          }}
          classes={{
            paper: classNames(classes.drawerPaper, {
              [classes.docsDrawerPaper]: isDocs,
            }),
          }}>
          {drawer}
        </Drawer>
        <Drawer
          variant="temporary"
          anchor={theme.direction === 'rtl' ? 'left' : 'right'}
          open={showHelpView}
          onClose={this.handleHelpViewToggle}
          classes={{
            paper: classes.helpDrawerPaper,
          }}
          ModalProps={{
            keepMounted: true,
          }}>
          <Fragment>
            <IconButton
              onClick={this.handleHelpViewToggle}
              className={classes.helpCloseIcon}>
              <CloseIcon />
            </IconButton>
            {helpView}
          </Fragment>
        </Drawer>
        <main
          className={classNames(
            classes.content,
            {
              [classes.contentPadding]: !disablePadding,
              [classes.docsContent]: isDocs,
            },
            className
          )}
          {...props}>
          {error ? <ErrorPanel fixed error={error} /> : children}
        </main>
      </div>
    );
  }
}
