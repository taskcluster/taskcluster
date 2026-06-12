import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import db from '../../../utils/db';
import NoTask from './index';

const mockHistory = { push: jest.fn() };

const richRecord = {
  taskId: 'ABC123defABC123defABC12',
  name: 'build-linux',
  source:
    'https://hg.mozilla.org/mozilla-central/file/abc/taskcluster/ci/build/linux.yml',
  taskQueueId: 'gecko-t/t-linux-xlarge-source',
  created: '2022-02-10T10:00:00.000Z',
  deadline: '2022-02-11T10:00:00.000Z',
  state: 'COMPLETED',
  viewedAt: 1644912000000,
};

const legacyRecord = {
  taskId: 'ZYX987utsZYX987utsZYX98',
};

jest.mock('../../../utils/db', () => ({
  taskIdsHistory: {
    orderBy: jest.fn().mockReturnThis(),
    reverse: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    toArray: jest.fn().mockResolvedValue([]),
  },
}));

describe('NoTask page', () => {
  it('renders recent tasks with rich and legacy records', async () => {
    db.taskIdsHistory.toArray.mockResolvedValueOnce([richRecord, legacyRecord]);

    let fragment;

    await act(async () => {
      const { asFragment } = render(
        <MemoryRouter keyLength={0}>
          <NoTask history={mockHistory} />
        </MemoryRouter>
      );

      await waitFor(() => {});
      fragment = asFragment();
    });

    expect(fragment).toMatchSnapshot();
  });

  it('renders without crashing when no recent tasks', async () => {
    await act(async () => {
      const { asFragment } = render(
        <MemoryRouter keyLength={0}>
          <NoTask history={mockHistory} />
        </MemoryRouter>
      );

      await waitFor(() => {});
      expect(asFragment()).toMatchSnapshot();
    });
  });
});
