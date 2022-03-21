import normalizeWorkerTypes from './normalizeWorkerTypes';

it('should normalize worker types', () => {
  const connection = {
    edges: [
      {
        node: {
          workerType: 'workerType1',
          workerTypeSummary: {
            name: 'workerType1',
            description: 'workerType1',
          },
        },
      },
      {
        node: {
          workerType: 'workerType2',
          workerTypeSummary: {
            name: 'workerType2',
            description: 'workerType2',
          },
        },
      },
    ],
  };
  const workerTypeSummaries = [
    {
      name: 'workerType1',
      description: 'workerType1',
    },
    {
      name: 'workerType2',
      description: 'workerType2',
    },
  ];

  expect(normalizeWorkerTypes(connection)).toEqual(connection);

  const result = normalizeWorkerTypes(connection, workerTypeSummaries);

  expect(result).toEqual({
    edges: [
      {
        node: {
          workerType: 'workerType1',
          workerTypeSummary: {
            name: 'workerType1',
            description: 'workerType1',
          },
        },
      },
      {
        node: {
          workerType: 'workerType2',
          workerTypeSummary: {
            name: 'workerType2',
            description: 'workerType2',
          },
        },
      },
    ],
  });
});
