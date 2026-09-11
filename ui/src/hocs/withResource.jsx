import React from 'react';
import useResource from '../utils/useResource';

const resolve = (value, props) =>
  typeof value === 'function' ? value(props) : value;

/**
 * Decorator that injects `useResource` state for a single (non-paginated)
 * REST resource as props.
 *
 * `fetch` receives the wrapped component's props and returns the async request
 * function. `key` may be a plain string or a function of props; the resource is
 * refetched whenever it changes. When `name` is given the state is injected as
 * a single `props[name]` object (so it can be combined with other resource
 * decorators); otherwise it is spread flat.
 */
const withResource =
  ({ name, fetch, key }) =>
  Component =>
    function ResourceComponent(props) {
      const state = useResource(fetch(props), { key: resolve(key, props) });
      const injected = name ? { [name]: state } : state;

      return <Component {...props} {...injected} />;
    };

export default withResource;
