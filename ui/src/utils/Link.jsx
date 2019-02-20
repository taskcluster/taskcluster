import React, { useState } from 'react';
import { oneOf } from 'prop-types';
import { Link as LinkNavigation } from 'react-router-dom';
import views from '../App/views';

/**
 * A react hook which augments `react-router-dom`'s `Link` component
 * with pre-fetching capabilities.
 */
export default function Link({ viewName, ...props }) {
  const [prefetchFlag, setPrefetchFlag] = useState(false);
  const prefetch = () => {
    if (viewName && !prefetchFlag) {
      const view = views[viewName];

      setPrefetchFlag(true);
      view.preload();
    }
  };

  const handleFocus = e => {
    const { onFocus } = props;

    prefetch();

    if (onFocus) {
      onFocus(e);
    }
  };

  const handleMouseOver = e => {
    const { onMouseOver } = props;

    prefetch();

    if (onMouseOver) {
      onMouseOver(e);
    }
  };

  return (
    <LinkNavigation
      {...props}
      {...(viewName
        ? {
            onFocus: handleFocus,
            onMouseOver: handleMouseOver,
          }
        : null)}
    />
  );
}

Link.propTypes = {
  // The view name
  viewName: oneOf(Object.keys(views)),
};

Link.defaultProps = {
  viewName: null,
};
