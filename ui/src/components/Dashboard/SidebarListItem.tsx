import ListItem from '@mui/material/ListItem';
import ListItemButton, {
  listItemButtonClasses,
} from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import { alpha, type SxProps, type Theme } from '@mui/material/styles';
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
  to?: string;
  selected?: boolean;
  children: ReactNode;
  icon?: ReactNode;
  rightIcon?: ReactNode;
  /** Rendered inside this item's `li` */
  nestedElement?: ReactNode;
  onClick?: (e: MouseEvent<HTMLElement>) => void;
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
  onActiveChange,
}: {
  children: ReactNode;
  onActiveChange?: (active: boolean) => void;
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
    onActiveChange?.(active);
  }, [active, onActiveChange]);

  return (
    <SidebarItemsContext.Provider value={value}>
      {children}
    </SidebarItemsContext.Provider>
  );
}

const itemSx: SxProps<Theme> = theme => ({
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
});

export default function SidebarListItem({
  to,
  selected: selectedProp = false,
  children,
  icon,
  rightIcon,
  nestedElement,
  onClick,
}: SidebarListItemProps) {
  const { pathname } = useLocation();
  const { paths, register } = useContext(SidebarItemsContext);
  const selected = to
    ? matchesPath(pathname, to) &&
      !paths.some(
        path => path.length > to.length && matchesPath(pathname, path)
      )
    : selectedProp;

  useLayoutEffect(() => (to ? register(to) : undefined), [register, to]);

  const content = (
    <>
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
    </>
  );

  return (
    <ListItem
      disablePadding
      sx={nestedElement ? { display: 'block' } : undefined}>
      {to ? (
        <ListItemButton
          component={Link}
          to={to}
          onClick={onClick}
          selected={selected}
          aria-current={selected ? 'page' : undefined}
          disableGutters
          sx={itemSx}>
          {content}
        </ListItemButton>
      ) : (
        <ListItemButton
          onClick={onClick}
          selected={selected}
          disableGutters
          sx={itemSx}>
          {content}
        </ListItemButton>
      )}
      {nestedElement}
    </ListItem>
  );
}
