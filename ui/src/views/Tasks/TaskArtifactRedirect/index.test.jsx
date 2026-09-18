import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route } from 'react-router-dom';
import TaskArtifactRedirect from './index';

vi.mock('../../../utils/Auth', () => ({ withAuth: Component => Component }));

it('preserves reserved characters through the router', () => {
  const taskId = 'eR1kMya2SruyMaRMZguROg';
  const name = 'public/file?#.txt';
  const encodedName = name.split('/').map(encodeURIComponent).join('/');

  render(
    <MemoryRouter initialEntries={[`/tasks/${taskId}/runs/0/${encodedName}`]}>
      <Route
        path="/tasks/:taskId/runs/:runId/:artifactName+"
        render={({ match }) => (
          <a href={new TaskArtifactRedirect({ match }).getRedirectUrl()}>
            Artifact
          </a>
        )}
      />
    </MemoryRouter>
  );

  expect(screen.getByRole('link').getAttribute('href')).toBe(
    `https://taskcluster.net/api/queue/v1/task/${taskId}/runs/0/artifacts/${encodeURIComponent(
      name
    )}`
  );
});
