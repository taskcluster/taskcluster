import { matchPath } from 'react-router-dom';

// Returns an array of matched routes.
const matchRoutes = (path, routes, branch = []) => {
  const matchingRoute = routes.find((route) =>
    matchPath(path, {
      path: route.path,
      exact: route.exact,
    }),
  );

  if (matchingRoute) {
    branch.push(matchingRoute);

    if (matchingRoute.routes) {
      matchRoutes(path, matchingRoute.routes, branch);
    }
  }

  return branch;
};

export default matchRoutes;
