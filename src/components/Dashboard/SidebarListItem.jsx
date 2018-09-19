import { Component, cloneElement } from 'react';
import { node, string } from 'prop-types';
import classNames from 'classnames';
import { withRouter, NavLink } from 'react-router-dom';
import { withStyles } from '@material-ui/core/styles';
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
      fill: theme.palette.common.white,
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
  },
}))
export default class SidebarListItem extends Component {
  static propTypes = {
    children: node.isRequired,
    to: string,
    icon: node,
    rightIcon: node,
  };

  static defaultProps = {
    to: null,
    icon: null,
    rightIcon: null,
  };

  // Some items have the same url prefix, however should not
  // be set active at the same time.
  isItemActive = route => {
    if (!route) {
      return false;
    }

    const taskIndexPath = '/tasks/index';
    const taskGroupsPath = '/tasks/index';
    const taskPath = '/tasks';
    const isTaskView =
      route.url === taskPath &&
      window.location.pathname.startsWith(taskPath) &&
      !window.location.pathname.startsWith(taskIndexPath) &&
      !window.location.pathname.startsWith(taskGroupsPath);
    const isTaskIndexView =
      route.url === taskIndexPath &&
      window.location.pathname.startsWith(taskIndexPath);
    const isTaskGroupView =
      route.url === taskGroupsPath &&
      window.location.pathname.startsWith(taskGroupsPath);

    return Boolean(
      !route.url.startsWith(taskPath) ||
        isTaskIndexView ||
        isTaskView ||
        isTaskGroupView
    );
  };

  render() {
    const { classes, icon, children, rightIcon, ...props } = this.props;

    return (
      <ListItem
        button
        disableGutters
        className={classes.listItem}
        component={NavLink}
        isActive={this.isItemActive}
        activeClassName={classes.active}
        {...props}>
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
