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
 */
const withPaginatedResource =
  ({ fetch, payload, select }) =>
  Component =>
    function PaginatedResourceComponent(props) {
      const state = usePaginatedResource(fetch(props), {
        payload: resolve(payload, props),
        select,
      });

      return <Component {...props} {...state} />;
    };

export default withPaginatedResource;
