import matchRoutes from './matchRoutes';

it('should match routes', () => {
  const routes = [
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
});
