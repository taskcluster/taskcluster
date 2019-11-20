import React, { Component } from 'react';
import List from '@material-ui/core/List';
import FeatureSearchIcon from 'mdi-react/FeatureSearchIcon';
import HexagonSlice4 from 'mdi-react/HexagonSlice4Icon';
import PlusCircleIcon from 'mdi-react/PlusCircleIcon';
import GroupIcon from 'mdi-react/GroupIcon';
import AccountMultipleIcon from 'mdi-react/AccountMultipleIcon';
import MixcloudIcon from 'mdi-react/MixcloudIcon';
import BackupRestoreIcon from 'mdi-react/BackupRestoreIcon';
import AccountKeyIcon from 'mdi-react/AccountKeyIcon';
import AccountStarIcon from 'mdi-react/AccountStarIcon';
import ScaleBalanceIcon from 'mdi-react/ScaleBalanceIcon';
import ArrowExpandVerticalIcon from 'mdi-react/ArrowExpandVerticalIcon';
import AccountSettingsIcon from 'mdi-react/AccountSettingsIcon';
import GithubBoxIcon from 'mdi-react/GithubBoxIcon';
import CancelIcon from 'mdi-react/CancelIcon';
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
        <SidebarListItem to="/tasks/create" icon={<PlusCircleIcon />}>
          Create task
        </SidebarListItem>
        <SidebarListItem to="/tasks" icon={<FeatureSearchIcon />}>
          View Task
        </SidebarListItem>
        <SidebarListItem to="/tasks/groups" icon={<GroupIcon />}>
          Task Groups
        </SidebarListItem>
        <SidebarListItem to="/tasks/index" icon={<FileTreeIcon />}>
          Task Index
        </SidebarListItem>

        <SidebarListGroup
          skipPrefetch
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
          <SidebarListItem
            to="/auth/scopes/compare"
            icon={<ScaleBalanceIcon />}>
            Compare Scopes
          </SidebarListItem>
          <SidebarListItem
            to="/auth/scopes/expansions"
            icon={<ArrowExpandVerticalIcon />}>
            Expand Scopes
          </SidebarListItem>
        </SidebarListGroup>

        <SidebarListItem to="/worker-manager" icon={<HexagonSlice4 />}>
          Worker Manager
        </SidebarListItem>

        <SidebarListItem to="/provisioners" icon={<MixcloudIcon />}>
          Workers
        </SidebarListItem>

        <SidebarListItem to="/purge-caches" icon={<BackupRestoreIcon />}>
          Purge Caches
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

        <SidebarListItem to="/quickstart" icon={<GithubBoxIcon />}>
          GitHub Quickstart
        </SidebarListItem>

        <SidebarListItem to="/notify/denylist" icon={<CancelIcon />}>
          Denylist Addresses
        </SidebarListItem>
      </List>
    );
  }
}
