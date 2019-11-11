import React, { Component, cloneElement } from 'react';
import { node, string } from 'prop-types';
import classNames from 'classnames';
import { withRouter } from 'react-router-dom';
import { withStyles } from '@material-ui/core/styles';
import { fade } from '@material-ui/core/styles/colorManipulator';
import ListItem from '@material-ui/core/ListItem';
import ListItemIcon from '@material-ui/core/ListItemIcon';
import ListItemText from '@material-ui/core/ListItemText';
import Link from '../../utils/Link';

@withRouter
@withStyles(theme => ({
  listLinkCell: {
    ...theme.mixins.hover,
  },
  active: {
    backgroundColor: theme.palette.secondary.dark,
    '&:hover': {
      backgroundColor: theme.palette.secondary.dark,
    },
    '& $text': {
      color: theme.palette.common.white,
    },
    '& $icon': {
      fill: fade(theme.palette.common.white, 0.9),
      '& svg': {
        fill: fade(theme.palette.common.white, 0.9),
      },
    },
  },
  listItem: {
    paddingLeft: theme.spacing(2),
    paddingRight: theme.spacing(1),
    backgroundColor: 'inherit',
  },
  text: {
    color: theme.palette.text.inactive,
    fontFamily: 'Roboto500',
    fontSize: theme.typography.body1.fontSize,
  },
  icon: {
    fill: theme.palette.text.inactive,
    '& svg': {
      fill: theme.palette.text.inactive,
    },
  },
}))
export default class SidebarListItem extends Component {
  static defaultProps = {
    to: null,
    icon: null,
    rightIcon: null,
  };

  static propTypes = {
    children: node.isRequired,
    to: string,
    icon: node,
    rightIcon: node,
  };

  // Some items have the same url prefix, however should not
  // be set active at the same time.
  isItemActive = route => {
    if (!route) {
      return false;
    }

    const paths = {
      tasks: '/tasks',
      index: '/tasks/index',
      groups: '/tasks/groups',
      create: '/tasks/create',
      auth: '/auth',
      compareScopes: '/auth/scopes/compare',
      expandScopes: '/auth/scopes/expansions',
      roles: '/auth/roles',
      clients: '/auth/clients',
    };
    const { pathname } = window.location;
    const isTaskView =
      route.url === paths.tasks &&
      !pathname.startsWith(paths.index) &&
      !pathname.startsWith(paths.groups) &&
      !pathname.startsWith(paths.create);
    const isTaskIndexView =
      route.url === paths.index && pathname.startsWith(paths.index);
    const isTaskGroupView =
      route.url === paths.groups && pathname.startsWith(paths.groups);
    const isTaskCreateView =
      route.url === paths.create && pathname.startsWith(paths.create);
    const isScopesView =
      route.url === paths.auth &&
      !pathname.startsWith(paths.compareScopes) &&
      !pathname.startsWith(paths.expandScopes);
    const isClientsView =
      route.url === paths.clients && pathname.startsWith(paths.clients);
    const isRolesView =
      route.url === paths.roles && pathname.startsWith(paths.roles);
    const isScopesCompareView =
      route.url === paths.compareScopes &&
      pathname.startsWith(paths.compareScopes);
    const isScopesExpandView =
      route.url === paths.expandScopes &&
      pathname.startsWith(paths.expandScopes);

    if (route.url.startsWith(paths.tasks)) {
      return Boolean(
        !route.url.startsWith(paths.tasks) ||
          isTaskIndexView ||
          isTaskView ||
          isTaskGroupView ||
          isTaskCreateView
      );
    }

    if (route.url.startsWith(paths.auth)) {
      return Boolean(
        route.url === paths.auth ||
          isScopesView ||
          isScopesCompareView ||
          isScopesExpandView ||
          isClientsView ||
          isRolesView
      );
    }

    return true;
  };

  render() {
    const {
      classes,
      icon,
      children,
      rightIcon,
      to,
      skipPrefetch,
      staticContext,
      ...props
    } = this.props;

    return (
      <Link
        skipPrefetch={skipPrefetch}
        to={to}
        nav
        activeClassName={classes.active}
        isActive={this.isItemActive}
        className={classes.listLinkCell}>
        <ListItem disableGutters className={classes.listItem} {...props}>
          {icon && (
            <ListItemIcon classes={{ root: classes.icon }}>{icon}</ListItemIcon>
          )}
          <ListItemText
            disableTypography
            className={classes.text}
            primary={children}
          />
          {rightIcon &&
            cloneElement(rightIcon, {
              className: classNames(classes.icon, rightIcon.props.className),
            })}
        </ListItem>
      </Link>
    );
  }
}
