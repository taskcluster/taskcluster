import { gqlTaskToApi } from './gqlToApi';

describe('gqlTaskToApi', () => {
  it('should transform all priority values correctly', () => {
    const priorities = {
      HIGHEST: 'highest',
      VERY_HIGH: 'very-high',
      HIGH: 'high',
      MEDIUM: 'medium',
      LOW: 'low',
      VERY_LOW: 'very-low',
      LOWEST: 'lowest',
      NORMAL: 'normal',
    };

    Object.entries(priorities).forEach(([gqlPriority, apiPriority]) => {
      const gqlTask = { requires: '', taskId: 't1', priority: gqlPriority };
      const apiTask = gqlTaskToApi(gqlTask);

      expect(apiTask.priority).toBe(apiPriority);
    });
  });
});
