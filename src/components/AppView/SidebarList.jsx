import { Component } from 'react';
import List from 'material-ui/List';
import LibraryIcon from 'mdi-react/LibraryIcon';
import HexagonMultipleIcon from 'mdi-react/HexagonMultipleIcon';
import HumanIcon from 'mdi-react/HumanIcon';
import PlusCircleIcon from 'mdi-react/PlusCircleIcon';
import BookOpenPageVariantIcon from 'mdi-react/BookOpenPageVariantIcon';
import GroupIcon from 'mdi-react/GroupIcon';
import SidebarListGroup from './SidebarListGroup';
import SidebarListItem from './SidebarListItem';

export default class SidebarList extends Component {
  render() {
    return (
      <List disablePadding>
        <SidebarListGroup
          to="/docs"
          title="Documentation"
          icon={<LibraryIcon />}>
          <SidebarListItem to="/docs/tutorial" icon={<HumanIcon />}>
            Tutorial
          </SidebarListItem>
          <SidebarListItem
            to="/docs/references"
            icon={<BookOpenPageVariantIcon />}>
            References
          </SidebarListItem>
        </SidebarListGroup>
        <SidebarListGroup
          to="/tasks"
          title="Tasks"
          icon={<HexagonMultipleIcon />}>
          <SidebarListItem to="/tasks/create" icon={<PlusCircleIcon />}>
            Create task
          </SidebarListItem>
          <SidebarListItem to="/tasks/groups" icon={<GroupIcon />}>
            Task Groups
          </SidebarListItem>
        </SidebarListGroup>
      </List>
    );
  }
}
