import { Component } from 'react';
import { object, func, string, array } from 'prop-types';
import classNames from 'classnames';
import { Link } from 'react-router-dom';
import { withStyles } from 'material-ui/styles';
import { MenuItem } from 'material-ui/Menu';
import List, { ListItemIcon, ListItemText } from 'material-ui/List';
import Collapse from 'material-ui/transitions/Collapse';
import ChevronUpIcon from 'mdi-react/ChevronUpIcon';
import ChevronDownIcon from 'mdi-react/ChevronDownIcon';

@withStyles(theme => {
  const menuSelected = {
    backgroundColor: theme.palette.primary.main,
    '& $icon': {
      color: theme.palette.common.white
    }
  };

  return {
    link: {
      textDecoration: 'none'
    },
    nested: {
      paddingLeft: theme.spacing.unit * 4
    },
    menuItemSelected: {
      ...menuSelected,
      '&:focus': menuSelected
    },
    icon: {}
  };
})
export default class DrawerListItem extends Component {
  static propTypes = {
    classes: object.isRequired,
    label: string.isRequired,
    icon: func,
    to: string,
    items: array
  };

  static defaultProps = {
    icon: null,
    to: null,
    items: null
  };

  state = {
    open: true
  };

  handleClick(props) {
    if (props.items) {
      this.setState({ open: !this.state.open });
    }
  }

  addLink = (to, item) => (
    <Link className={this.props.classes.link} to={to}>
      {item}
    </Link>
  );

  renderItem({ label, icon: Icon, ...props }) {
    return (
      <MenuItem button onClick={() => this.handleClick(props)}>
        <ListItemIcon>
          <Icon />
        </ListItemIcon>
        <ListItemText primary={label} />
        {props.items &&
          (this.state.open ? <ChevronUpIcon /> : <ChevronDownIcon />)}
      </MenuItem>
    );
  }

  renderNestedItems = items => {
    const { classes } = this.props;

    return (
      <Collapse in={this.state.open} timeout="auto" unmountOnExit>
        {items.map(({ key, icon: Icon, label, to, ...props }) => (
          <List key={key} {...props} component="div" disablePadding>
            <Link className={classes.link} to={to}>
              <MenuItem
                button
                className={classNames(classes.nested, {
                  [classes.menuItemSelected]: window.location.pathname === to
                })}>
                <ListItemIcon className={classes.icon}>
                  {Icon && <Icon />}
                </ListItemIcon>
                <ListItemText inset primary={label} />
              </MenuItem>
            </Link>
          </List>
        ))}
      </Collapse>
    );
  };

  render() {
    const { to, items } = this.props;
    const Item = this.renderItem(this.props);

    return (
      <div>
        {to ? this.addLink(to, Item) : Item}
        {items && this.renderNestedItems(items)}
      </div>
    );
  }
}
