import {
  arrayOf,
  bool,
  instanceOf,
  number,
  object,
  oneOf,
  oneOfType,
  shape,
  string,
} from 'prop-types';

export const user = shape({
  name: string,
  nickname: string,
  picture: string,
  sub: string,
});

export const date = oneOfType([string, instanceOf(Date)]);

export const pageInfo = shape({
  hasNextPage: bool,
  hasPreviousPage: bool,
  cursor: string,
  previousCursor: string,
  nextCursor: string,
});

export const artifact = shape({
  name: string,
  contentType: string,
  url: string,
  isPublicLog: bool,
});

export const artifacts = shape({
  pageInfo,
  edges: arrayOf(artifact),
});

export const run = shape({
  taskId: string,
  state: string,
  reasonCreated: string,
  scheduled: date,
  started: date,
  workerGroup: string,
  workerId: string,
  takenUntil: date,
  artifacts,
});

export const runs = arrayOf(run);

export const status = shape({
  state: oneOf([
    'RUNNING',
    'PENDING',
    'UNSCHEDULED',
    'COMPLETED',
    'FAILED',
    'EXCEPTION',
  ]),
  retriesLeft: number,
  runs,
});

export const task = shape({
  metadata: shape({
    name: string,
    description: string,
    owner: string,
    source: string,
  }),
  status,
  retries: number,
  created: date,
  deadline: date,
  expires: date,
  priority: string,
  provisionerId: string,
  workerType: string,
  schedulerId: string,
  dependencies: arrayOf(string),
  tags: object, // eslint-disable-line
  scopes: arrayOf(string),
  routes: arrayOf(string),
  payload: object, // eslint-disable-line
  extra: object, // eslint-disable-line
});
