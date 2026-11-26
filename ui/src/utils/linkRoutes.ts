export interface PreloadableRoute {
  path?: string;
  exact?: boolean;
  component: { preload: () => Promise<unknown> };
  routes?: PreloadableRoute[];
}

export let linkRoutes: PreloadableRoute[] = [];

// App calls this on load; it avoids an import cycle by importing App/routes
export function setLinkRoutes(routes: PreloadableRoute[]) {
  linkRoutes = routes;
}
