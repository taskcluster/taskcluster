import React, { forwardRef } from 'react';
import { node, bool, string } from 'prop-types';
import withStyles from '../../utils/withStyles';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';

const styles = theme => ({
  root: {
    display: 'inline-block',
    verticalAlign: 'middle',
    paddingTop: 0,
    paddingBottom: 0,
    width: '100%',
  },
  listItem: {
    marginLeft: theme.spacing(-1),
    padding: theme.spacing(1),
    width: 'auto',
  },
  listItemButton: {
    ...theme.mixins.listItemButton,
    display: 'flex',
    justifyContent: 'space-between',
  },
});

/**
 * A table cell item with styles inherited from List and ListItem to be used
 * when placed immediately after a TableCell. Useful for cells that
 * have a text label and an icon.
 */
const TableCellItem = forwardRef(function TableCellItem(
  { classes, children, className = null, dense: _dense, ...props },
  ref
) {
  return (
    <List
      component="div"
      classes={{ root: classes.root }}
      className={className}>
      <ListItem
        ref={ref}
        component="span"
        classes={{ gutters: classes.listItem }}
        className={classes.listItemButton}
        {...props}>
        {children}
      </ListItem>
    </List>
  );
});

TableCellItem.propTypes = {
  /** The table cell contents. */
  children: node.isRequired,
  /** Set to true to remove the padding applied to the List component */
  dense: bool,
  /** The CSS class name of the wrapper element */
  className: string,
};

export default withStyles(styles)(TableCellItem);
