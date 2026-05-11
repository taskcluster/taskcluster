import { test, expect } from './fixtures.mjs';
import { BasePage } from './pages/BasePage.mjs';
import { HomePage } from './pages/HomePage.mjs';

const ROUTES = [
  { path: '/', name: 'home' },
  { path: '/docs', name: 'docs-index' },
  { path: '/docs/manual', name: 'docs-manual' },
  { path: '/docs/tutorial/hello-world', name: 'docs-tutorial' },
  { path: '/docs/reference', name: 'docs-reference' },
  { path: '/tasks', name: 'tasks' },
  { path: '/provisioners', name: 'provisioners' },
  { path: '/quickstart', name: 'quickstart' },
];

for (const route of ROUTES) {
  test(`${route.name} (${route.path}) renders without errors`, async ({ page, issues }) => {
    const basePage = new BasePage(page);
    const unsettled = await basePage.navigate(route.path);

    expect(await basePage.hasNotFound(), 'SPA rendered NotFound').toBe(false);

    for (const req of unsettled) {
      issues.requestfailed.push(
        `${req.method()} ${req.url()} (didn't settle within timeout)`
      );
    }

    const allIssues = Object.entries(issues)
      .flatMap(([kind, items]) => items.map((item) => `[${kind}] ${item}`));
    expect(allIssues, 'page had errors').toEqual([]);
  });
}

test('home page navigation drawer contains expected items', async ({ page }) => {
  const homePage = new HomePage(page);
  await homePage.open();
  await homePage.openDrawer();

  for (const label of ['Create task', 'View Task', 'Task Groups', 'Task Index']) {
    await expect(homePage.drawerItem(label)).toBeVisible({ timeout: 5000 });
  }
});
