import { Component } from 'react';
import List from '@material-ui/core/List';
import LibraryIcon from 'mdi-react/LibraryIcon';
import HexagonMultipleIcon from 'mdi-react/HexagonMultipleIcon';
import HumanIcon from 'mdi-react/HumanIcon';
import PlusCircleIcon from 'mdi-react/PlusCircleIcon';
import BookOpenPageVariantIcon from 'mdi-react/BookOpenPageVariantIcon';
import GroupIcon from 'mdi-react/GroupIcon';
import AccountMultipleIcon from 'mdi-react/AccountMultipleIcon';
import AmazonIcon from 'mdi-react/AmazonIcon';
import HelpCircleOutlineIcon from 'mdi-react/HelpCircleOutlineIcon';
import MixcloudIcon from 'mdi-react/MixcloudIcon';
import BackupRestoreIcon from 'mdi-react/BackupRestoreIcon';
import AccountKeyIcon from 'mdi-react/AccountKeyIcon';
import AccountStarIcon from 'mdi-react/AccountStarIcon';
import ArrowExpandVerticalIcon from 'mdi-react/ArrowExpandVerticalIcon';
import AccountSettingsIcon from 'mdi-react/AccountSettingsIcon';
import FileTreeIcon from 'mdi-react/FileTreeIcon';
import WebhookIcon from 'mdi-react/WebhookIcon';
import KeyIcon from 'mdi-react/KeyIcon';
import PulseIcon from 'mdi-react/PulseIcon';
import SidebarListGroup from './SidebarListGroup';
import SidebarListItem from './SidebarListItem';

export default class SidebarList extends Component {
  render() {
    return (
      <List disablePadding>
        <SidebarListItem to="/tasks" icon={<HexagonMultipleIcon />}>
          View Task
        </SidebarListItem>
        <SidebarListItem to="/tasks/create" icon={<PlusCircleIcon />}>
          Create task
        </SidebarListItem>
        <SidebarListItem to="/tasks/groups" icon={<GroupIcon />}>
          Task Groups
        </SidebarListItem>
        <SidebarListItem to="/tasks/index" icon={<FileTreeIcon />}>
          Task Index
        </SidebarListItem>

        <SidebarListGroup
          to="/auth"
          title="Authorization"
          icon={<AccountKeyIcon />}>
          <SidebarListItem to="/auth/clients" icon={<AccountMultipleIcon />}>
            Clients
          </SidebarListItem>
          <SidebarListItem to="/auth/roles" icon={<AccountStarIcon />}>
            Roles
          </SidebarListItem>
          <SidebarListItem to="/auth/scopes" icon={<AccountSettingsIcon />}>
            Scopes
          </SidebarListItem>
        </SidebarListGroup>

        <SidebarListItem to="/aws-provisioner" icon={<AmazonIcon />}>
          AWS Provisioner
        </SidebarListItem>

        <SidebarListItem to="/provisioners" icon={<MixcloudIcon />}>
          Provisioners
        </SidebarListItem>

        <SidebarListItem to="/caches" icon={<BackupRestoreIcon />}>
          Caches
        </SidebarListItem>

        <SidebarListItem to="/hooks" icon={<WebhookIcon />}>
          Hooks
        </SidebarListItem>

        <SidebarListItem to="/secrets" icon={<KeyIcon />}>
          Secrets
        </SidebarListItem>

        <SidebarListItem to="/pulse-messages" icon={<PulseIcon />}>
          Pulse Messages
        </SidebarListItem>

        <SidebarListItem to="/expansions" icon={<ArrowExpandVerticalIcon />}>
          Expand Scopesets
        </SidebarListItem>

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
          <SidebarListItem
            to="/docs/resources"
            icon={<HelpCircleOutlineIcon />}>
            Resources
          </SidebarListItem>
          <SidebarListItem to="/docs/people" icon={<AccountMultipleIcon />}>
            People
          </SidebarListItem>
        </SidebarListGroup>
      </List>
    );
  }
}
