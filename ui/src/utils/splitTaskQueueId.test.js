import splitTaskQueueId from './splitTaskQueueId';

it('should split task queue id', () => {
  expect(splitTaskQueueId('provisionerId/workerType')).toEqual({
    provisionerId: 'provisionerId',
    workerType: 'workerType',
  });
  expect(splitTaskQueueId('provisionerId/workerType/sub-type')).toEqual({
    provisionerId: 'provisionerId',
    workerType: 'workerType',
  });
});
