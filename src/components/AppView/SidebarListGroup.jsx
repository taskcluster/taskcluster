import { Component, Fragment } from 'react';
import { arrayOf, node, string } from 'prop-types';
import { withStyles } from 'material-ui/styles';
import Collapse from 'material-ui/transitions/Collapse';
import List from 'material-ui/List';
import ChevronDownIcon from 'mdi-react/ChevronDownIcon';
import ChevronUpIcon from 'mdi-react/ChevronUpIcon';
import SidebarListItem from './SidebarListItem';

@withStyles(theme => ({
  listGroup: {
    '& > a': {
      paddingLeft: theme.spacing.triple
    }
  }
}))
export default class SidebarListGroup extends Component {
  static propTypes = {
    children: arrayOf(node).isRequired,
    title: string.isRequired,
    icon: node
  };

  static defaultProps = {
    icon: null
  };

  state = {
    open: false
  };

  handleClick = e => {
    e.preventDefault();
    this.setState({ open: !this.state.open });
  };

  render() {
    const { classes, children, icon, title, to } = this.props;
    const { open } = this.state;

    return (
      <Fragment>
        <SidebarListItem
          to={to}
          onClick={this.handleClick}
          icon={icon}
          rightIcon={open ? <ChevronUpIcon /> : <ChevronDownIcon />}>
          {title}
        </SidebarListItem>
        <Collapse in={open} timeout="auto" unmountOnExit>
          <List component="div" disablePadding className={classes.listGroup}>
            {children}
          </List>
        </Collapse>
      </Fragment>
    );
  }
}
