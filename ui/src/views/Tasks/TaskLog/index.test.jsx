import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route } from 'react-router-dom';
import { vi } from 'vitest';
import { buildLogViewerUrl } from '../../../utils/artifactNames';
import TaskLog from './index';

vi.mock('../../../utils/Auth', () => ({ withAuth: Component => Component }));
vi.mock('@material-ui/core/styles', async importOriginal => ({
  ...(await importOriginal()),
  withStyles: () => Component => Component,
}));
vi.mock('@apollo/client/react/hoc', async importOriginal => ({
  ...(await importOriginal()),
  graphql: () => Component => Component,
}));

const taskId = 'eR1kMya2SruyMaRMZguROg';
const baseUrl = `https://taskcluster.net/api/queue/v1/task/${taskId}/runs/0/artifacts/`;

function expectArtifactUrl(path, name, isLiveLog = false) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Route
        path={`/tasks/:taskId/runs/:runId/logs/${isLiveLog ? 'live/' : ''}:name+`}
        render={({ match }) => (
          <a href={new TaskLog({ match }).getLogUrl()}>Raw log</a>
        )}
      />
    </MemoryRouter>
  );

  expect(screen.getByRole('link').getAttribute('href')).toBe(
    `${baseUrl}${encodeURIComponent(name)}`
  );
}

describe.each([false, true])('log route (live: %s)', isLiveLog => {
  it.each([
    'https:foo.log',
    'public/logs/live.log',
    'public/logs/file & name.log',
    'public/logs/file?query.log',
    'public/logs/file#fragment.log',
  ])('preserves the artifact name %s through the router', name => {
    expectArtifactUrl(
      buildLogViewerUrl({ taskId, runId: 0, name, isLiveLog }),
      name,
      isLiveLog
    );
  });
});

it('preserves malformed percent encoding in a direct log link', () => {
  expectArtifactUrl(
    `/tasks/${taskId}/runs/0/logs/public/logs/%25foo.log`,
    'public/logs/%foo.log'
  );
});
