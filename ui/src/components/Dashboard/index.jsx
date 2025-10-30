import React, { Component, Fragment } from 'react';
import { bool, node, string } from 'prop-types';
import { withRouter } from 'react-router-dom';
import classNames from 'classnames';
import { titleCase } from 'title-case';
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
import { ErrorBoundary } from 'react-error-boundary';
import reportError from '../../utils/reportError';
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

import { version } from '../../../../version.json';

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
      marginLeft: theme.spacing(1),
      fontFamily: 'Roboto',
      fontWeight: 300,
      flex: 1,
      color: THEME.PRIMARY_TEXT_DARK,
    },
    toolbar: {
      ...theme.mixins.toolbar,
      paddingLeft: theme.spacing(2),
      paddingRight: theme.spacing(2),
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
      [theme.breakpoints.down('xs')]: {
        width: theme.spacing(30),
      },
    },
    helpDrawerPaper: {
      width: '40vw',
      [theme.breakpoints.down('sm')]: {
        width: '90vw',
      },
      backgroundColor: theme.palette.primary.main,
      padding: theme.spacing(3),
    },
    title: {
      textDecoration: 'none',
      color: theme.palette.text.primary,
      width: '100%',
    },
    contentPadding: {
      paddingTop: theme.spacing(3),
      paddingLeft: theme.spacing(3),
      paddingRight: theme.spacing(3),
      paddingBottom: theme.spacing(12),
    },
    logoStyle: {
      paddingRight: theme.spacing(2),
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
      marginLeft: theme.spacing(1),
    },
    appIcon: {
      fill: theme.palette.common.white,
    },
    helpCloseIcon: {
      position: 'absolute',
      top: theme.spacing(1),
      right: theme.spacing(1),
    },
    deploymentVersion: {
      padding: theme.spacing(2),
      '&:hover': {
        textDecoration: 'underline',
        color: theme.palette.primary.contrastText,
      },
    },
    nav: {
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      justifyContent: 'space-between',
    },
    disableAppbar: {
      width: '100%',
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
    disableTitleFormatting: false,
    disableAppbar: false,
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
    /**
     * If true, the title will not be formatted to uppercase.
     */
    disableTitleFormatting: bool,
    /**
     * If true, the app bar will not be rendered.
     */
    disableAppbar: bool,
  };

  state = {
    navOpen: false,
    showHelpView: false,
    deploymentVersion: null,
  };

  componentDidMount() {
    const deploymentVersion = this.getDeploymentVersion();

    this.setState({ deploymentVersion });
  }

  getDeploymentVersion() {
    return version || 'unknown';
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
      disableTitleFormatting,
      disableAppbar,
      ...props
    } = this.props;
    const { navOpen, showHelpView, deploymentVersion } = this.state;
    const logoWithApplicationName = (
      <Fragment>
        <div className={classes.toolbar}>
          <img
            className={classes.logoStyle}
            height={30}
            alt="logo"
            src={Logo}
          />
          {window.env.DOCS_ONLY ? (
            <Typography variant="h6" noWrap className={classes.title}>
              {window.env.APPLICATION_NAME}
            </Typography>
          ) : (
            <Link to="/">
              <Typography variant="h6" noWrap className={classes.title}>
                {window.env.APPLICATION_NAME}
              </Typography>
            </Link>
          )}
        </div>
      </Fragment>
    );
    const drawer = (
      <nav className={classes.nav}>
        <div id="sidebar-menu">
          {window.env.DOCS_ONLY ? (
            <Link to="/">{logoWithApplicationName}</Link>
          ) : (
            <div>{logoWithApplicationName}</div>
          )}
          <Divider />
          <UserMenu />
          <Divider />
          {docs ? <DocsSidebarList /> : <SidebarList />}
        </div>
        {deploymentVersion && (
          <Link
            to={`${DOCS_PATH_PREFIX}/changelog?version=v${deploymentVersion}`}
            title="See changelog">
            <Typography
              className={classes.deploymentVersion}
              variant="caption"
              noWrap>
              {deploymentVersion}
            </Typography>
          </Link>
        )}
      </nav>
    );
    const isDocs = history.location.pathname.startsWith(DOCS_PATH_PREFIX);
    const isMobileView = width === 'sm' || width === 'xs';
    const pageTitle = disableTitleFormatting ? title : titleCase(title);

    return (
      <div className={classes.root}>
        <Helmet />
        <PageTitle>{pageTitle}</PageTitle>
        {!disableAppbar && (
          <Fragment>
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
                    id="toggle-drawer"
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
                <Link to={DOCS_PATH_PREFIX}>
                  <Tooltip placement="bottom" title="Documentation">
                    <IconButton>
                      <BookOpenPageVariantIcon className={classes.appIcon} />
                    </IconButton>
                  </Tooltip>
                </Link>
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
          </Fragment>
        )}
        <main
          className={classNames(
            {
              [classes.content]: !disableAppbar,
              [classes.contentPadding]: !disablePadding,
              [classes.docsContent]: isDocs && !disableAppbar,
              [classes.disableAppbar]: disableAppbar,
            },
            className
          )}
          {...props}>
          <ErrorBoundary FallbackComponent={ErrorPanel} onError={reportError}>
            {children}
          </ErrorBoundary>
        </main>
      </div>
    );
  }
}
