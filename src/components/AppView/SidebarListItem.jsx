import { Component } from 'react';
import { node, string } from 'prop-types';
import { NavLink } from 'react-router-dom';
import { withStyles } from 'material-ui/styles';
import { ListItem, ListItemIcon, ListItemText } from 'material-ui/List';

@withStyles(theme => ({
  active: {
    backgroundColor: theme.palette.text.active
  },
  listItem: {
    paddingLeft: theme.spacing.double,
    paddingRight: theme.spacing.unit
  }
}))
export default class SidebarListItem extends Component {
  static propTypes = {
    children: node.isRequired,
    to: string,
    icon: node,
    rightIcon: node
  };

  static defaultProps = {
    to: null,
    icon: null,
    rightIcon: null
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
        {icon && <ListItemIcon>{icon}</ListItemIcon>}
        <ListItemText inset primary={children} />
        {rightIcon}
      </ListItem>
    );
  }
}
