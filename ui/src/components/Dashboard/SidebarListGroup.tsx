import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ChevronDownIcon from 'mdi-react/ChevronDownIcon';
import ChevronUpIcon from 'mdi-react/ChevronUpIcon';
import { type ReactNode, useCallback, useState } from 'react';
import SidebarListItem, { SidebarItems } from './SidebarListItem';

export interface SidebarListGroupProps {
  title: string;
  children: ReactNode;
  icon?: ReactNode;
}

export default function SidebarListGroup({
  title,
  children,
  icon,
}: SidebarListGroupProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(false);
  const handleActiveChange = useCallback((active: boolean) => {
    setActive(active);

    if (active) {
      setOpen(true);
    }
  }, []);

  return (
    <SidebarListItem
      selected={active}
      onClick={() => setOpen(!open)}
      icon={icon}
      rightIcon={open ? <ChevronUpIcon /> : <ChevronDownIcon />}
      nestedElement={
        <Collapse in={open} timeout="auto">
          <List disablePadding sx={{ '& > li > a': { paddingLeft: 3 } }}>
            <SidebarItems onActiveChange={handleActiveChange}>
              {children}
            </SidebarItems>
          </List>
          <Divider />
        </Collapse>
      }>
      {title}
    </SidebarListItem>
  );
}
