import { fade } from '@material-ui/core/styles/colorManipulator';

// eslint-disable-next-line import/prefer-default-export
export const ARTIFACTS_PAGE_SIZE = 10;
export const TASK_GROUP_PAGE_SIZE = 10;
export const TASK_GROUP_PROGRESS_SIZE = 100;
export const VIEW_WORKER_TYPES_PAGE_SIZE = 50;
export const VIEW_WORKERS_PAGE_SIZE = 15;
export const VIEW_CLIENTS_PAGE_SIZE = 20;
export const VIEW_CLIENT_SCOPES_INSPECT_SIZE = 10;
export const VIEW_SECRETS_PAGE_SIZE = 100;
export const VIEW_CACHE_PURGES_PAGE_SIZE = 20;
export const SCOPES_SEARCH_MODE = {
  EXACT: 'EXACT',
  HAS_SCOPE: 'HAS SCOPE',
  HAS_SUB_SCOPE: 'HAS SUB SCOPE',
};
export const HOOKS_LAST_FIRE_TYPE = {
  NO_FIRE: 'NoFire',
  SUCCESSFUL_FIRE: 'HookSuccessfulFire',
  FAILED_FIRE: 'HookFailedFire',
};
export const THEME = {
  TEN_PERCENT_WHITE: fade('#fff', 0.1),
  TEN_PERCENT_BLACK: fade('#000', 0.1),
  DARK_THEME_BACKGROUND: '#12202c',
  PRIMARY_DARK: '#1b2a39',
  PRIMARY_LIGHT: '#fafafa',
  PRIMARY_TEXT_DARK: 'rgba(255, 255, 255, 0.9)',
  PRIMARY_TEXT_LIGHT: 'rgba(0, 0, 0, 0.9)',
  SECONDARY: '#4177a5',
};
// eslint-disable-next-line max-len
export const VALID_TASK = /^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$/;
export const TASKS_CREATE_STORAGE_KEY = 'tasks:create';
export const ISO_8601_REGEX = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/;
export const DEFAULT_AWS_WORKER_TYPE = {
  minCapacity: 0,
  maxCapacity: 5,
  scalingRatio: 0,
  minPrice: 0,
  maxPrice: 0.6,
  canUseOndemand: false,
  canUseSpot: true,
  instanceTypes: [
    {
      instanceType: 'c3.xlarge',
      capacity: 1,
      utility: 1,
      secrets: {},
      scopes: [],
      userData: {},
      launchSpec: {},
    },
  ],
  regions: [
    {
      region: 'us-west-2',
      secrets: {},
      scopes: [],
      userData: {},
      launchSpec: {
        ImageId: 'ami-xx',
      },
    },
  ],
  userData: {},
  launchSpec: {},
  secrets: {},
  scopes: [],
};
export const TASK_STATE = {
  COMPLETED: 'COMPLETED',
  RUNNING: 'RUNNING',
  FAILED: 'FAILED',
  EXCEPTION: 'EXCEPTION',
  PENDING: 'PENDING',
  UNSCHEDULED: 'UNSCHEDULED',
};
// 30 seconds
// export const TASK_GROUP_POLLING_INTERVAL = 30000;
export const TASK_GROUP_POLLING_INTERVAL = 30000;
export const INITIAL_CURSOR = '$$FIRST$$';
