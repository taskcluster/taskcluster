import React, { Component, Fragment } from 'react';
import { arrayOf, node, string } from 'prop-types';
import withStyles from '@mui/styles/withStyles';
import Collapse from '@mui/material/Collapse';
import List from '@mui/material/List';
import Divider from '@mui/material/Divider';
import ChevronDownIcon from 'mdi-react/ChevronDownIcon';
import ChevronUpIcon from 'mdi-react/ChevronUpIcon';
import SidebarListItem from './SidebarListItem';

@withStyles(theme => ({
  listGroup: {
    '& > a > li': {
      paddingLeft: theme.spacing(3),
    },
  },
}))
export default class SidebarListGroup extends Component {
  static defaultProps = {
    icon: null,
  };

  static propTypes = {
    children: arrayOf(node).isRequired,
    title: string.isRequired,
    icon: node,
  };

  state = {
    open: false,
  };

  handleClick = e => {
    e.preventDefault();
    this.setState({ open: !this.state.open });
  };

  render() {
    const { classes, children, icon, title, to, ...props } = this.props;
    const { open } = this.state;

    return (
      <Fragment>
        <SidebarListItem
          to={to}
          onClick={this.handleClick}
          icon={icon}
          rightIcon={open ? <ChevronUpIcon /> : <ChevronDownIcon />}
          {...props}>
          {title}
        </SidebarListItem>
        <Collapse in={open} timeout="auto">
          <List component="div" disablePadding className={classes.listGroup}>
            {children}
          </List>
          <Divider />
        </Collapse>
      </Fragment>
    );
  }
}
