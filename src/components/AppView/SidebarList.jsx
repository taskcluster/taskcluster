import { Component } from 'react';
import { NavLink } from 'react-router-dom';
import { withStyles } from 'material-ui/styles';
import List, { ListItem, ListItemIcon, ListItemText } from 'material-ui/List';
import LibraryIcon from 'mdi-react/LibraryIcon';
import HexagonMultipleIcon from 'mdi-react/HexagonMultipleIcon';

@withStyles(theme => ({
  active: {
    backgroundColor: theme.palette.text.active
  }
}))
export default class SidebarList extends Component {
  render() {
    const { classes } = this.props;

    return (
      <List>
        <ListItem
          button
          component={NavLink}
          activeClassName={classes.active}
          to="/docs">
          <ListItemIcon>
            <LibraryIcon />
          </ListItemIcon>
          <ListItemText primary="Documentation" />
        </ListItem>

        <ListItem
          button
          component={NavLink}
          activeClassName={classes.active}
          exact
          to="/">
          <ListItemIcon>
            <HexagonMultipleIcon />
          </ListItemIcon>
          <ListItemText primary="Tasks" />
        </ListItem>
      </List>
    );
  }
}
