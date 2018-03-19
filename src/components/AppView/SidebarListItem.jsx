import { Component, cloneElement } from 'react';
import { node, string } from 'prop-types';
import classNames from 'classnames';
import { NavLink } from 'react-router-dom';
import { withStyles } from 'material-ui/styles';
import { ListItem, ListItemIcon, ListItemText } from 'material-ui/List';

@withStyles(theme => ({
  active: {
    backgroundColor: theme.palette.text.active,
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

  render() {
    const { classes, icon, children, rightIcon, ...props } = this.props;

    return (
      <ListItem
        button
        disableGutters
        className={classes.listItem}
        component={NavLink}
        activeClassName={classes.active}
        {...props}>
        {icon && <ListItemIcon className={classes.icon}>{icon}</ListItemIcon>}
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
