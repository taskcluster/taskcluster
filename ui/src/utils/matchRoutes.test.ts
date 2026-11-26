import { expect, it } from 'vitest';
import matchRoutes from './matchRoutes';

interface TestRoute {
  path: string;
  exact?: boolean;
  component: string;
  routes?: TestRoute[];
}

it('should match routes', () => {
  const routes: TestRoute[] = [
    {
      path: '/',
      exact: true,
      component: 'Home',
    },
    {
      path: '/about',
      exact: true,
      component: 'About',
      routes: [
        {
          path: '/about',
          component: 'AboutMe',
        },
        {
          path: '/about/you',
          component: 'AboutYou',
        },
      ],
    },
  ];

  expect(matchRoutes('/', routes)).toEqual([
    {
      path: '/',
      exact: true,
      component: 'Home',
    },
  ]);

  expect(matchRoutes('/about', routes)).toEqual([
    {
      path: '/about',
      exact: true,
      component: 'About',
      routes: routes[1].routes,
    },
    {
      path: '/about',
      component: 'AboutMe',
    },
  ]);

  expect(matchRoutes('/nope', routes)).toEqual([]);
});
