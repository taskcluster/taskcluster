import React, { Component } from 'react';
import { node, bool, string } from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';

@withStyles(theme => ({
  root: {
    display: 'inline-block',
    verticalAlign: 'middle',
    paddingTop: 0,
    paddingBottom: 0,
    width: '100%',
  },
  listItem: {
    marginLeft: -theme.spacing(1),
    padding: theme.spacing(1),
  },
  listItemButton: {
    ...theme.mixins.listItemButton,
    display: 'flex',
    justifyContent: 'space-between',
  },
}))
/**
 * A table cell item with styles inherited from List and ListItem to be used
 * when placed immediately after a TableCell. Useful for cells that
 * have a text label and an icon.
 */
export default class TableCellItem extends Component {
  static defaultProps = {
    dense: true,
    className: null,
  };

  static propTypes = {
    /** The table cell contents. */
    children: node.isRequired,
    /** Set to true to remove the padding applied to the List component */
    dense: bool,
    /** The CSS class name of the wrapper element */
    className: string,
  };

  render() {
    const { classes, children, className, dense, ...props } = this.props;

    return (
      <List
        component="div"
        classes={{ root: classes.root }}
        className={className}>
        <ListItem
          component="span"
          classes={{ gutters: classes.listItem }}
          className={classes.listItemButton}
          {...props}>
          {children}
        </ListItem>
      </List>
    );
  }
}
