import React, { useState } from 'react';
import { bool } from 'prop-types';
import { Link as RouterLink, NavLink } from 'react-router-dom';
import isAbsolute from 'is-absolute-url';
import matchRoutes from './matchRoutes';

/**
 * A react hook which augments `react-router-dom`'s `Link` component
 * with pre-fetching capabilities.
 */
const Link = React.forwardRef(({ nav, to, skipPrefetch, ...props }, ref) => {
  let shouldReload = false;
  const path = typeof to === 'string' ? to : to.pathname;
  const isPathAbsolute = isAbsolute(path);
  const Component = nav ? NavLink : RouterLink;
  const [prefetchFlag, setPrefetchFlag] = useState(false);

  function prefetch() {
    if (prefetchFlag) {
      return;
    }

    if (!isPathAbsolute) {
      const matchingRoutes = matchRoutes(path, Link.routes);
      const components = matchingRoutes.map(({ component }) =>
        component.preload()
      );

      Promise.all(components).catch(() => {
        shouldReload = true;
      });
    }

    setPrefetchFlag(true);
  }

  function handleFocus(e) {
    const { onFocus } = props;

    prefetch();

    if (onFocus) {
      onFocus(e);
    }
  }

  function handleMouseOver(e) {
    const { onMouseOver } = props;

    prefetch();

    if (onMouseOver) {
      onMouseOver(e);
    }
  }

  async function handleClick(ev) {
    if (ev.altKey || ev.metaKey || ev.ctrlKey || ev.shiftKey) {
      return;
    }

    // The user might try to navigate to a file that
    // no longer exists (e.g., when a filename chunk is updated when deploying)
    if (shouldReload) {
      ev.preventDefault();
      window.location = to;
    }
  }

  if (isPathAbsolute) {
    /* eslint-disable jsx-a11y/anchor-has-content */
    return <a href={to} {...props} target="_blank" rel="noopener noreferrer" />;
  }

  if (skipPrefetch) {
    return <Component to={to} {...props} />;
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

Link.propTypes = {
  /**
   * If true, the `NavLink` component of `react-router-dom` will be used
   * as the main link component.
   */
  nav: bool,
  /**
   * If true, the component will not make use of pre-fetching.
   * Instead, it will fallback to using the raw router.
   */
  skipPrefetch: bool,
};

Link.defaultProps = {
  nav: false,
  skipPrefetch: false,
};

// App calls this on load; it avoids an import cycle by importing App/routes
Link.setRoutes = routes => {
  Link.routes = routes;
};

Link.displayName = 'Link';

export default Link;
