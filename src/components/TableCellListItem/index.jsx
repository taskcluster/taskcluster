import { Component } from 'react';
import { node, bool } from 'prop-types';
import { withStyles } from 'material-ui/styles';
import List, { ListItem } from 'material-ui/List';

@withStyles(theme => ({
  root: {
    display: 'inline-block',
    verticalAlign: 'middle',
  },
  listItem: {
    marginLeft: -theme.spacing.unit,
    padding: theme.spacing.unit,
  },
  listItemButton: {
    ...theme.mixins.listItemButton,
  },
}))
/**
 * A styled ListItem to be used when placed immediately after a TableCell.
 */
export default class TableCellListItem extends Component {
  static propTypes = {
    /** The table cell contents. */
    children: node.isRequired,
    /* Set to true to remove the padding applied to the List component */
    dense: bool,
  };

  static defaultProps = {
    dense: true,
  };

  render() {
    const { classes, children, dense, ...props } = this.props;

    return (
      <List dense={dense} classes={{ root: classes.root }}>
        <ListItem
          classes={{ gutters: classes.listItem }}
          className={classes.listItemButton}
          {...props}>
          {children}
        </ListItem>
      </List>
    );
  }
}
