# UI work

`yarn lint`, `yarn test`, and `yarn build` exiting 0 do not prove a UI
change works. Before claiming any UI change done:

- Start the dev server: `cd ui && yarn start` with `TASKCLUSTER_ROOT_URL`
  set (e.g. `https://community-tc.services.mozilla.com`).
- Open the affected pages with the browser console + Network tab open.
- Confirm no new uncaught exceptions, `console.error` lines, or 4xx/5xx
  network requests.
- Exercise the primary flow of each affected page.
- For visible changes, attach a screenshot to the PR.

If you can't run the dev server in this environment, say so explicitly
in the PR description.

## `yarn smoke`

Runs Playwright tests in `test/smoke/` against a running dev server.
The smoke suite visits unauthenticated routes, checks for page errors,
failed requests, HTTP 4xx+, and NotFound renders, and screenshots each.

To add a route, add an entry to `ROUTES` in `test/smoke/routes.spec.mjs`.
For page-specific interactions, add a new `test()` in the same file or a
new `.spec.mjs` file under `test/smoke/`.

Tests follow the Page Object pattern: tests interact with page classes
(in `test/smoke/pages/`), not Playwright APIs directly. `BasePage`
handles navigation and settling; subclasses like `HomePage` expose
page-specific accessors and actions. Assertions stay in test files.

First-time setup:

- `cd ui && yarn install` — `ui/` is a standalone workspace, so a root
  `yarn install` won't pick up its `package.json`.
- `npx playwright install chromium` — postinstall is disabled in
  `.yarnrc.yml`.
