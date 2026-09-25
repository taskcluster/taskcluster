import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Route } from 'react-router-dom';
import { vi } from 'vitest';
import { buildLogViewerUrl } from '../../../utils/artifactNames';
import TaskLog from './index';

vi.mock('../../../utils/Auth', () => ({ withAuth: Component => Component }));
vi.mock('@material-ui/core/styles', async importOriginal => ({
  ...(await importOriginal()),
  withStyles: () => Component => Component,
}));
vi.mock('../../../utils/TaskclusterClient', () => ({
  withTaskclusterClient: Component => Component,
}));
// Dashboard renders null under jsdom (withWidth needs matchMedia); expose the
// title so the REST-loaded task name can be asserted
vi.mock('../../../components/Dashboard', () => ({
  default: ({ title, children }) => {
    return (
      <div>
        <h1>{title}</h1>
        {children}
      </div>
    );
  },
}));
vi.mock('../../../components/Helmet', () => ({
  default: ({ state }) => {
    return <span data-testid="run-state">{state ?? ''}</span>;
  },
}));
vi.mock('../../../components/Log', () => ({
  default: ({ url }) => {
    return <pre data-testid="log">{url}</pre>;
  },
}));

const taskId = 'eR1kMya2SruyMaRMZguROg';
const baseUrl = `https://taskcluster.net/api/queue/v1/task/${taskId}/runs/0/artifacts/`;

afterEach(() => window.history.replaceState({}, '', '/'));

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

it('preserves an artifact name encoded as one route parameter', () => {
  const name = 'public/logs/100%.log';
  const artifactPath = `/tasks/${taskId}/runs/0/logs/`;

  window.history.replaceState(
    {},
    '',
    `${artifactPath}${encodeURIComponent(name)}`
  );

  render(
    <BrowserRouter>
      <Route
        path="/tasks/:taskId/runs/:runId/logs/:name+"
        render={({ match }) => (
          <a href={new TaskLog({ match }).getLogUrl()}>Raw log</a>
        )}
      />
    </BrowserRouter>
  );

  expect(screen.getByRole('link').getAttribute('href')).toBe(
    `${baseUrl}${encodeURIComponent(name)}`
  );
});

describe('task details', () => {
  const renderPage = queue => {
    render(
      <MemoryRouter>
        <TaskLog
          classes={{}}
          match={{
            params: { taskId, runId: '1', name: 'public/logs/live.log' },
          }}
          createTaskclusterClient={() => {
            return queue;
          }}
        />
      </MemoryRouter>
    );
  };

  it('loads the task name and run state over REST', async () => {
    const queue = {
      task: vi.fn().mockResolvedValue({ metadata: { name: 'build linux' } }),
      status: vi.fn().mockResolvedValue({
        status: { runs: [{ state: 'exception' }, { state: 'running' }] },
      }),
    };

    renderPage(queue);

    expect(
      await screen.findByRole('heading', { name: 'Log "build linux"' })
    ).toBeTruthy();
    expect(screen.getByTestId('run-state').textContent).toBe('running');
    expect(queue.task).toHaveBeenCalledWith(taskId);
    expect(queue.status).toHaveBeenCalledWith(taskId);
  });

  it('still shows the log when the task cannot be fetched', async () => {
    const queue = {
      task: vi.fn().mockRejectedValue(new Error('InsufficientScopes')),
      status: vi.fn().mockRejectedValue(new Error('InsufficientScopes')),
    };

    renderPage(queue);

    await vi.waitFor(() => {
      expect(queue.status).toHaveBeenCalled();
    });
    expect(screen.getByRole('heading', { name: 'Log' })).toBeTruthy();
    expect(screen.getByTestId('log').textContent).toBe(
      `${baseUrl}${encodeURIComponent('public/logs/live.log')}`.replace(
        '/runs/0/',
        '/runs/1/'
      )
    );
  });
});
