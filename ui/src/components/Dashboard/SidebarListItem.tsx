import ListItem from '@mui/material/ListItem';
import ListItemButton, {
  listItemButtonClasses,
} from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import { alpha } from '@mui/material/styles';
import {
  createContext,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { useLocation } from 'react-router-dom';
import Link from '../../utils/Link';

export interface SidebarListItemProps {
  to: string;
  children: ReactNode;
  icon?: ReactNode;
  rightIcon?: ReactNode;
  /** Rendered inside this item's `li` */
  nestedElement?: ReactNode;
  skipPrefetch?: boolean;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
}

function matchesPath(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(`${path}/`);
}

const SidebarItemsContext = createContext({
  paths: [] as string[],
  register: (_path: string) => () => {},
});

export function SidebarItems({
  children,
  onActive,
}: {
  children: ReactNode;
  onActive?: () => void;
}) {
  const { pathname } = useLocation();
  const [paths, setPaths] = useState<string[]>([]);
  const active = paths.some(path => matchesPath(pathname, path));
  const register = useCallback((path: string) => {
    setPaths(current => [...current, path]);

    return () =>
      setPaths(current => current.toSpliced(current.indexOf(path), 1));
  }, []);
  const value = useMemo(() => ({ paths, register }), [paths, register]);

  useLayoutEffect(() => {
    if (active) {
      onActive?.();
    }
  }, [active, onActive]);

  return (
    <SidebarItemsContext.Provider value={value}>
      {children}
    </SidebarItemsContext.Provider>
  );
}

export default function SidebarListItem({
  to,
  children,
  icon,
  rightIcon,
  nestedElement,
  skipPrefetch,
  onClick,
}: SidebarListItemProps) {
  const { pathname } = useLocation();
  const { paths, register } = useContext(SidebarItemsContext);
  const selected =
    matchesPath(pathname, to) &&
    !paths.some(path => path.length > to.length && matchesPath(pathname, path));

  useLayoutEffect(() => register(to), [register, to]);

  return (
    <ListItem
      disablePadding
      sx={nestedElement ? { display: 'block' } : undefined}>
      <ListItemButton
        component={Link}
        to={to}
        skipPrefetch={skipPrefetch}
        onClick={onClick}
        selected={selected}
        aria-current={selected ? 'page' : undefined}
        disableGutters
        sx={theme => ({
          ...theme.mixins.hover,
          paddingLeft: 2,
          paddingRight: 1,
          color: theme.palette.text.inactive,
          '& svg': {
            fill: theme.palette.text.inactive,
          },
          [`&.${listItemButtonClasses.selected}, &.${listItemButtonClasses.selected}:hover, &.${listItemButtonClasses.selected}.${listItemButtonClasses.focusVisible}`]:
            {
              backgroundColor: theme.palette.secondary.dark,
              color: theme.palette.common.white,
              '& svg': {
                fill: alpha(theme.palette.common.white, 0.9),
              },
            },
        })}>
        {icon && <ListItemIcon>{icon}</ListItemIcon>}
        <ListItemText
          disableTypography
          primary={children}
          sx={theme => ({
            fontWeight: 500,
            fontSize: theme.typography.body1.fontSize,
          })}
        />
        {rightIcon}
      </ListItemButton>
      {nestedElement}
    </ListItem>
  );
}
