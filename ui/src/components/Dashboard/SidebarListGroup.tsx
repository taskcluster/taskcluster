import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ChevronDownIcon from 'mdi-react/ChevronDownIcon';
import ChevronUpIcon from 'mdi-react/ChevronUpIcon';
import { type MouseEvent, type ReactNode, useCallback, useState } from 'react';
import SidebarListItem, { SidebarItems } from './SidebarListItem';

export interface SidebarListGroupProps {
  to: string;
  title: string;
  children: ReactNode;
  icon?: ReactNode;
  skipPrefetch?: boolean;
}

export default function SidebarListGroup({
  to,
  title,
  children,
  icon,
  skipPrefetch,
}: SidebarListGroupProps) {
  const [open, setOpen] = useState(false);
  const expand = useCallback(() => setOpen(true), []);

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    setOpen(!open);
  }

  return (
    <SidebarListItem
      to={to}
      skipPrefetch={skipPrefetch}
      onClick={handleClick}
      icon={icon}
      rightIcon={open ? <ChevronUpIcon /> : <ChevronDownIcon />}
      nestedElement={
        <Collapse in={open} timeout="auto">
          <List disablePadding sx={{ '& > li > a': { paddingLeft: 3 } }}>
            <SidebarItems onActive={expand}>{children}</SidebarItems>
          </List>
          <Divider />
        </Collapse>
      }>
      {title}
    </SidebarListItem>
  );
}
