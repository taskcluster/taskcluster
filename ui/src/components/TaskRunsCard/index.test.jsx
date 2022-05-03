import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TaskRunsCard from './index';

it('should render TaskRunsCard', () => {
  const { asFragment } = render(
    <MemoryRouter keyLength={0}>
      <TaskRunsCard
        taskQueueId="task/queueId"
        task={{
          taskId: 'taskId',
          status: {
            taskId: 'taskId',
            provisioinerId: 'p1',
            workerType: 'workerType',
            taskGroupId: 'tg1',
            state: 'RUNNING',
          },
          taskQueueId: 'task/queueId',
          created: new Date().toISOString(),
          deadline: new Date().toISOString(),
          expires: new Date().toISOString(),
          scopes: ['scopes'],
          routes: [],
          payload: {
            command: [
              '/bin/bash',
              '-c',
              'for ((i=1;i<=600;i++)); do echo $i; sleep 1; done',
            ],
            image: 'ubuntu:latest',
            maxRunTime: 630,
          },
          metadata: {
            source: 'https://test.taskcluster-dev.net/task/taskId',
          },
          extra: {},
        }}
        selectedRunId=""
        runs={[
          {
            taskId: 'eR1kMya2SruyMaRMZguROg',
            runId: 0,
            state: 'COMPLETED',
            reasonCreated: 'SCHEDULED',
            reasonResolved: 'COMPLETED',
            scheduled: '2022-02-03T14:41:19.706Z',
            started: '2022-02-03T14:43:54.086Z',
            resolved: '2022-02-03T14:45:28.396Z',
            workerGroup: 'us-east1',
            workerId: '7421215367664916236',
            takenUntil: '2022-02-03T15:03:54.082Z',
            artifacts: {
              pageInfo: {
                hasNextPage: false,
                hasPreviousPage: false,
                cursor: '$$FIRST$$',
                previousCursor: null,
                nextCursor: null,
                __typename: 'PageInfo',
              },
              edges: [
                {
                  node: {
                    name: 'public/coverage-final.json',
                    contentType: 'application/json',
                    __typename: 'Artifact',
                  },
                  __typename: 'ArtifactsEdge',
                },
                {
                  node: {
                    name: 'public/logs/live_backing.log',
                    contentType: 'text/plain; charset=utf-8',
                    __typename: 'Artifact',
                  },
                  __typename: 'ArtifactsEdge',
                },
                {
                  node: {
                    name: 'public/logs/live.log',
                    contentType: 'text/plain; charset=utf-8',
                    __typename: 'Artifact',
                  },
                  __typename: 'ArtifactsEdge',
                },
              ],
              __typename: 'ArtifactsConnection',
            },
            __typename: 'TaskRun',
          },
        ]}
      />
    </MemoryRouter>
  );

  expect(asFragment()).toMatchSnapshot();
});
