import { matchPath } from 'react-router-dom';

interface Route<R> {
  path?: string;
  exact?: boolean;
  routes?: R[];
}

// Returns an array of matched routes.
export default function matchRoutes<R extends Route<R>>(
  path: string,
  routes: R[]
): R[] {
  const match = routes.find(route =>
    matchPath(path, { path: route.path, exact: route.exact })
  );

  return match ? [match, ...matchRoutes(path, match.routes ?? [])] : [];
}
