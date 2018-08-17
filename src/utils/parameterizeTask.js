import { omit } from 'ramda';
import merge from 'deepmerge';
import cloneDeep from 'lodash.clonedeep';
import fromNowJSON from './fromNowJSON';

// Transform task to an interactive task
export default task =>
  merge(
    omit(
      [
        'taskGroupId',
        'routes',
        'dependencies',
        'requires',
        'scopes',
        'payload',
      ],
      cloneDeep(task)
    ),
    {
      retries: 0,
      deadline: fromNowJSON('12 hours'),
      created: fromNowJSON(),
      expires: fromNowJSON('7 days'),
      // Delete cache scopes
      scopes: task.scopes.filter(scope => !/^docker-worker:cache:/.test(scope)),
      payload: merge(omit(['artifacts', 'cache'], task.payload || {}), {
        maxRunTime: Math.max(
          task.payload && task.payload.maxRunTime,
          3 * 60 * 60
        ),
        features: {
          interactive: true,
        },
        env: {
          TASKCLUSTER_INTERACTIVE: 'true',
        },
      }),
    }
  );
