import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import db from '../../../utils/db';
import NoTaskGroup from './index';

const mockHistory = { push: jest.fn() };

const richRecord = {
  taskGroupId: 'GRP123defGRP123defGRP12',
  name: 'Decision Task',
  source:
    'https://hg.mozilla.org/mozilla-central/file/abc/taskcluster/ci/decision',
  taskQueueId: 'gecko-t/decision',
  created: '2022-02-10T10:00:00.000Z',
  statusCount: {
    completed: 8,
    failed: 1,
    exception: 0,
    running: 0,
    pending: 0,
    unscheduled: 1,
  },
  viewedAt: 1644912000000,
};

const resolvedRecord = {
  taskGroupId: 'RSV123defRSV123defRSV12',
  name: 'Resolved Group',
  statusCount: {
    completed: 5,
    failed: 0,
    exception: 0,
    running: 0,
    pending: 0,
    unscheduled: 0,
  },
  viewedAt: 1644908000000,
};

const legacyRecord = {
  taskGroupId: 'LEG987utsLEG987utsLEG98',
};

jest.mock('../../../utils/db', () => ({
  taskGroupIdsHistory: {
    orderBy: jest.fn().mockReturnThis(),
    reverse: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    toArray: jest.fn().mockResolvedValue([]),
  },
}));

describe('NoTaskGroup page', () => {
  it('renders recent task groups with rich and legacy records', async () => {
    db.taskGroupIdsHistory.toArray.mockResolvedValueOnce([
      richRecord,
      resolvedRecord,
      legacyRecord,
    ]);

    let fragment;

    await act(async () => {
      const { asFragment } = render(
        <MemoryRouter keyLength={0}>
          <NoTaskGroup history={mockHistory} />
        </MemoryRouter>
      );

      await waitFor(() => {});
      fragment = asFragment();
    });

    expect(fragment).toMatchSnapshot();
  });

  it('renders without crashing when no recent task groups', async () => {
    await act(async () => {
      const { asFragment } = render(
        <MemoryRouter keyLength={0}>
          <NoTaskGroup history={mockHistory} />
        </MemoryRouter>
      );

      await waitFor(() => {});
      expect(asFragment()).toMatchSnapshot();
    });
  });
});
