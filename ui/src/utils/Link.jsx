import React, { useState } from 'react';
import { bool } from 'prop-types';
import { Link as RouterLink, NavLink } from 'react-router-dom';
import routes from '../App/routes';
import matchRoutes from './matchRoutes';

/**
 * A react hook which augments `react-router-dom`'s `Link` component
 * with pre-fetching capabilities.
 */
export default function Link({ viewName, nav, ...props }) {
  const Component = nav ? NavLink : RouterLink;
  const [prefetchFlag, setPrefetchFlag] = useState(false);

  function prefetch() {
    const { to } = props;
    const path = typeof to === 'string' ? to : to.pathname;

    if (prefetchFlag) {
      return;
    }

    const matchingRoutes = matchRoutes(path, routes);

    matchingRoutes.forEach(({ component }) => component.preload());

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

  return (
    <Component {...props} onFocus={handleFocus} onMouseOver={handleMouseOver} />
  );
}

Link.propTypes = {
  /**
   * If true, the `NavLink` component of `react-router-dom` will be used
   * as the main link component.
   */
  nav: bool,
};

Link.defaultProps = {
  nav: false,
};
