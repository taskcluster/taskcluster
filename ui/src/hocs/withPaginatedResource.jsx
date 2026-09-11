import React from 'react';
import usePaginatedResource from '../utils/usePaginatedResource';

const resolve = (value, props) =>
  typeof value === 'function' ? value(props) : value;

/**
 * Decorator that injects `usePaginatedResource` state as props.
 *
 * `fetch` receives the wrapped component's props and returns the request
 * function. `payload` may be a plain object or a function of props (useful
 * when a query-string parameter needs to reach the backend).
 *
 * When `name` is given, the state is injected as a single `props[name]` object
 * instead of being spread flat. This lets a component stack more than one
 * `withPaginatedResource` decorator (e.g. namespaces and indexed tasks on the
 * same page) without the prop names colliding.
 */
const withPaginatedResource =
  ({ name, fetch, payload, select }) =>
  Component =>
    function PaginatedResourceComponent(props) {
      const state = usePaginatedResource(fetch(props), {
        payload: resolve(payload, props),
        select,
      });
      const injected = name ? { [name]: state } : state;

      return <Component {...props} {...injected} />;
    };

export default withPaginatedResource;
