import { type FocusEvent, forwardRef, type MouseEvent, useRef } from 'react';
import {
  NavLink,
  type NavLinkProps,
  Link as RouterLink,
  type LinkProps as RouterLinkProps,
} from 'react-router-dom';
import { linkRoutes } from './linkRoutes';
import matchRoutes from './matchRoutes';

export interface LinkProps extends Omit<RouterLinkProps, 'to'> {
  to: string;
  /**
   * Use a `NavLink` component from `react-router-dom` as the main link
   * component.
   */
  nav?: boolean;
  activeClassName?: NavLinkProps['activeClassName'];
  isActive?: NavLinkProps['isActive'];
  skipPrefetch?: boolean;
}

const SCHEME_REGEX = /^[a-z][a-z\d+\-.]*:/i;

/**
 * A component which augments `react-router-dom`'s `Link` component
 * with pre-fetching capabilities.
 */
const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { nav, to, skipPrefetch, ...props },
  ref
) {
  const prefetched = useRef(false);
  const shouldReload = useRef(false);

  if (SCHEME_REGEX.test(to)) {
    return (
      <a
        ref={ref}
        href={to}
        {...props}
        target="_blank"
        rel="noopener noreferrer"
      />
    );
  }

  const Component = nav ? NavLink : RouterLink;

  if (skipPrefetch) {
    return <Component ref={ref} to={to} {...props} />;
  }

  function prefetch() {
    if (prefetched.current) {
      return;
    }

    const components = matchRoutes(to, linkRoutes).map(({ component }) =>
      component.preload()
    );

    Promise.all(components).catch(() => {
      shouldReload.current = true;
    });
    prefetched.current = true;
  }

  function handleFocus(e: FocusEvent<HTMLAnchorElement>) {
    prefetch();
    props.onFocus?.(e);
  }

  function handleMouseOver(e: MouseEvent<HTMLAnchorElement>) {
    prefetch();
    props.onMouseOver?.(e);
  }

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    props.onClick?.(e);

    if (
      e.defaultPrevented ||
      e.altKey ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey
    ) {
      return;
    }

    // The user might try to navigate to a file that
    // no longer exists (e.g., when a filename chunk is updated when deploying)
    if (shouldReload.current) {
      e.preventDefault();
      window.location.assign(to);
    }
  }

  return (
    <Component
      ref={ref}
      to={to}
      {...props}
      onFocus={handleFocus}
      onMouseOver={handleMouseOver}
      onClick={handleClick}
    />
  );
});

export default Link;
