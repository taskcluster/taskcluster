import {
  filterTasks,
  filterTasksByName,
  filterTasksByState,
  filterTasksWithDuration,
  formatTime,
  quantile,
  sampleTasks,
  taskDurationIds,
  taskIds,
  taskLastRun,
  taskRunDurationInMs,
  taskRunEarliestStart,
  taskRunLatestResolve,
} from './task';

it('should return last run time', () => {
  const task = {
    status: {
      runs: [
        { runId: 0, started: 1, resolved: 1 },
        { runId: 1, started: 10, resolved: 15 },
        { runId: 2, started: 100, resolved: 150 },
      ],
    },
  };

  expect(taskLastRun(task)).toEqual({
    from: 100,
    to: 150,
  });

  expect(taskLastRun({ status: { runs: [] } })).toBeNull();
});

it('should return task duration in ms', () => {
  const from = new Date('2022-05-05T15:15:15.000');
  const to = new Date('2022-05-05T15:15:20.000');

  expect(taskRunDurationInMs({ from, to })).toEqual(5000);
  expect(taskRunDurationInMs({})).toEqual(0);
});

it('should return earliest task run start time', () => {
  const task = {
    status: {
      runs: [
        { runId: 0, started: new Date('2022-05-05T05:05:05.000') },
        { runId: 1, started: new Date('2022-05-05T05:05:10.000') },
        { runId: 2, started: new Date('2022-05-05T05:05:15.000') },
      ],
    },
  };

  expect(taskRunEarliestStart(task)).toEqual(
    new Date('2022-05-05T05:05:05.000').getTime()
  );
});

it('should return latest task run resolve time', () => {
  const task = {
    status: {
      runs: [
        { runId: 0, resolved: new Date('2022-05-05T05:05:15.000') },
        { runId: 1, resolved: new Date('2022-05-05T05:05:35.000') },
        { runId: 2, resolved: new Date('2022-05-05T05:05:25.000') },
      ],
    },
  };

  expect(taskRunLatestResolve(task)).toEqual(
    new Date('2022-05-05T05:05:35.000').getTime()
  );
});

it('should filter tasks by state', () => {
  expect(filterTasksByState(['started'], [])).toEqual([]);
  expect(
    filterTasksByState(
      ['started'],
      [
        { node: { taskId: 1, status: { state: 'scheduled' } } },
        { node: { taskId: 2, status: { state: 'started' } } },
      ]
    )
  ).toEqual([{ node: { taskId: 2, status: { state: 'started' } } }]);
  expect(
    filterTasksByState(
      ['stopped'],
      [
        { node: { taskId: 1, status: { state: 'scheduled' } } },
        { node: { taskId: 2, status: { state: 'started' } } },
      ]
    )
  ).toEqual([]);
});

it('should filter tasks by name', () => {
  expect(filterTasksByName('', [])).toEqual([]);
  expect(
    filterTasksByName('gecko', [
      { node: { taskId: 1, metadata: { name: 'win11 docker test' } } },
      { node: { taskId: 2, metadata: { name: 'linux gecko test' } } },
    ])
  ).toEqual([{ node: { taskId: 2, metadata: { name: 'linux gecko test' } } }]);
  expect(
    filterTasksByName('NO SUCH MATCH', [
      { node: { taskId: 1, metadata: { name: 'win11 docker test' } } },
      { node: { taskId: 2, metadata: { name: 'linux gecko test' } } },
    ])
  ).toEqual([]);
});

it('should filter tasks by state and name', () => {
  expect(filterTasks([], [], '')).toEqual([]);
  expect(
    filterTasks(
      [
        {
          node: {
            taskId: 1,
            status: { state: 'started' },
            metadata: { name: 'win11 docker test' },
          },
        },
        {
          node: {
            taskId: 2,
            status: { state: 'resolved' },
            metadata: { name: 'linux gecko test' },
          },
        },
      ],
      ['started'],
      'docker'
    )
  ).toEqual([
    {
      node: {
        taskId: 1,
        status: { state: 'started' },
        metadata: { name: 'win11 docker test' },
      },
    },
  ]);
  expect(
    filterTasks(
      [
        {
          node: {
            taskId: 1,
            status: { state: 'started' },
            metadata: { name: 'win11 docker test' },
          },
        },
        {
          node: {
            taskId: 2,
            status: { state: 'resolved' },
            metadata: { name: 'linux gecko test' },
          },
        },
      ],
      ['failed'],
      'no such match'
    )
  ).toEqual([]);
});

it('should map tasks to string', () => {
  expect(
    taskIds([
      {
        node: {
          taskId: 't1',
          metadata: { name: 'test1' },
          status: { state: 'started' },
        },
      },
      {
        node: {
          taskId: 't2',
          metadata: { name: 'test2' },
          status: { state: 'failed' },
        },
      },
    ])
  ).toEqual(['t1-test1-started', 't2-test2-failed']);
});

it('should map task durations to string', () => {
  expect(
    taskDurationIds([
      { taskId: 't1', name: 'test1', state: 'started' },
      { taskId: 't2', name: 'test2', state: 'failed' },
    ])
  ).toEqual(['t1-test1-started', 't2-test2-failed']);
});

it('should filter tasks with duration', () => {
  expect(filterTasksWithDuration([], [], '')).toEqual([]);
  expect(
    filterTasksWithDuration(
      [
        {
          node: {
            taskId: 't1',
            metadata: { name: 'task1' },
            status: {
              runs: [
                {
                  runId: 0,
                  started: new Date('2022-05-05T05:05:05.000'),
                  resolved: new Date('2022-05-05T05:05:15.000'),
                },
              ],
            },
          },
        },
        {
          node: {
            taskId: 't2',
            metadata: { name: 'task2' },
            status: {
              state: 'resolved',
              runs: [
                {
                  runId: 0,
                  started: new Date('2022-05-05T05:06:05.000'),
                  resolved: new Date('2022-05-05T05:06:15.000'),
                },
              ],
            },
          },
        },
      ],
      ['resolved'],
      ''
    )
  ).toEqual([
    {
      duration: 10000,
      minStart: new Date('2022-05-05T05:06:05.000').getTime(),
      maxResolve: new Date('2022-05-05T05:06:15.000').getTime(),
      taskId: 't2',
      name: 'task2',
      state: 'resolved',
    },
  ]);
});

it('should sample tasks by duration', () => {
  expect(sampleTasks([])).toEqual([]);
  const list1 = [{ duration: 1 }, { duration: 20 }, { duration: 50 }];

  expect(sampleTasks(list1, '', '', 3)).toEqual(list1);
  expect(sampleTasks(list1, '', '', 2)).toEqual([
    { duration: 1 },
    { duration: 50 },
  ]);
  expect(sampleTasks(list1, '', '', 1)).toEqual([{ duration: 1 }]);

  const list2 = [
    { duration: 100 },
    { duration: 2000 },
    { duration: 2002 },
    { duration: 2004 },
    { duration: 5000 },
  ];

  expect(sampleTasks(list2, '', '', 3)).toEqual([
    { duration: 100 },
    { duration: 2000 },
    { duration: 5000 },
  ]);
});

it('should calculate quantiles', () => {
  expect(quantile([], 0.5)).toEqual(0);
  expect(quantile([1, 1, 1], 0.5)).toEqual(1);
  expect(quantile([1, 1, 1, 5, 6], 0.5)).toEqual(1);
  expect(quantile([1, 1, 1, 5, 6], 0.1)).toEqual(1);
  expect(quantile([1, 2, 3, 4, 5], 0.75)).toEqual(4);
});

it('should format time', () => {
  expect(formatTime(-1)).toEqual('n/a');
  expect(formatTime(-Infinity)).toEqual('n/a');
  expect(formatTime(1000)).toEqual('00:01');
  expect(formatTime(120 * 1000)).toEqual('02:00');
  expect(formatTime(60 * 60 * 1000)).toEqual('01:00:00');
  expect(formatTime(60 * 60 * 1000 + 5000)).toEqual('01:00:05');
});
