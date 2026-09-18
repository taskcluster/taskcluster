import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter, Route } from 'react-router-dom';
import TaskArtifactRedirect from './index';

vi.mock('../../../utils/Auth', () => ({ withAuth: Component => Component }));

afterEach(() => window.history.replaceState({}, '', '/'));

it.each([
  'public/file?#%26.txt',
  'public/100%.txt',
  'public/literal%2Fname.txt',
  'public/%2e%2e/file.txt',
  'public/back\\slash.txt',
  'public/file & name.txt',
  'public/nested/file.txt',
  'public//file.txt',
  '/public/file.txt',
  'public/../file.txt',
  'public/./file.txt',
])('preserves the artifact name %s through the router', name => {
  const taskId = 'eR1kMya2SruyMaRMZguROg';
  const encodedName = encodeURIComponent(name);

  window.history.replaceState({}, '', `/tasks/${taskId}/runs/0/${encodedName}`);

  render(
    <BrowserRouter>
      <Route
        path="/tasks/:taskId/runs/:runId/:artifactName+"
        render={({ match }) => (
          <a href={new TaskArtifactRedirect({ match }).getRedirectUrl()}>
            Artifact
          </a>
        )}
      />
    </BrowserRouter>
  );

  expect(screen.getByRole('link').getAttribute('href')).toBe(
    `https://taskcluster.net/api/queue/v1/task/${taskId}/runs/0/artifacts/${encodeURIComponent(
      name
    )}`
  );
});
