import React, { Component, cloneElement } from 'react';
import { node, string } from 'prop-types';
import classNames from 'classnames';
import { withRouter, NavLink } from 'react-router-dom';
import { withStyles } from '@material-ui/core/styles';
import { fade } from '@material-ui/core/styles/colorManipulator';
import ListItem from '@material-ui/core/ListItem';
import ListItemIcon from '@material-ui/core/ListItemIcon';
import ListItemText from '@material-ui/core/ListItemText';

@withRouter
@withStyles(theme => ({
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
    paddingLeft: theme.spacing.double,
    paddingRight: theme.spacing.unit,
  },
  text: {
    color: theme.palette.text.inactive,
    fontFamily: 'Roboto500',
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
      index: '/tasks/index',
      groups: '/tasks/groups',
      create: '/tasks/create',
      tasks: '/tasks',
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

    return Boolean(
      !route.url.startsWith(paths.tasks) ||
        isTaskIndexView ||
        isTaskView ||
        isTaskGroupView ||
        isTaskCreateView
    );
  };

  render() {
    const {
      classes,
      icon,
      children,
      rightIcon,
      staticContext,
      ...props
    } = this.props;

    return (
      <ListItem
        button
        disableGutters
        className={classes.listItem}
        component={NavLink}
        isActive={this.isItemActive}
        activeClassName={classes.active}
        {...props}
      >
        {icon && (
          <ListItemIcon classes={{ root: classes.icon }}>{icon}</ListItemIcon>
        )}
        <ListItemText
          disableTypography
          className={classes.text}
          inset
          primary={children}
        />
        {rightIcon &&
          cloneElement(rightIcon, {
            className: classNames(rightIcon.props.className, classes.icon),
          })}
      </ListItem>
    );
  }
}
