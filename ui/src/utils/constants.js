import GestureTapIcon from 'mdi-react/GestureTapIcon';
import OneTwoThreeIcon from 'mdi-react/OneTwoThreeIcon';
import BookOpenVariantIcon from 'mdi-react/BookOpenVariantIcon';
import BookOpenOutlineIcon from 'mdi-react/BookOpenOutlineIcon';
import OpenInNewIcon from 'mdi-react/OpenInNewIcon';
import ListStatusIcon from 'mdi-react/FormatListChecksIcon';
import AccountHeartOutlineIcon from 'mdi-react/AccountHeartOutlineIcon';

export const ARTIFACTS_SHOW_MAX = 10;
export const ARTIFACTS_PAGE_SIZE = 1000;
export const DEPENDENTS_PAGE_SIZE = 25;
export const TASK_GROUP_PAGE_SIZE = 1000;
export const VIEW_WORKER_TYPES_PAGE_SIZE = 1000;
export const VIEW_WORKERS_PAGE_SIZE = 1000;
export const VIEW_WORKER_POOLS_PAGE_SIZE = 1000;
export const VIEW_WORKER_POOL_LAUNCH_CONFIG_PAGE_SIZE = 1000;
export const VIEW_PROVIDERS_PAGE_SIZE = 1000;
export const VIEW_WORKER_POOL_ERRORS_PAGE_SIZE = 100;
export const VIEW_WORKER_POOL_PENDING_TASKS_PAGE_SIZE = 100;
export const VIEW_CLIENTS_PAGE_SIZE = 1000;
export const VIEW_ROLES_PAGE_SIZE = 1000;
export const VIEW_SECRETS_PAGE_SIZE = 1000;
export const VIEW_DENYLIST_PAGE_SIZE = 20;
export const VIEW_NAMESPACES_PAGE_SIZE = 20;
export const VIEW_CACHE_PURGES_PAGE_SIZE = 1000;
export const DASHBOARD_STATS_PAGE_SIZE = 1000;

export const THEME = {
  TEN_PERCENT_WHITE: 'rgba(255, 255, 255, 0.1)',
  TEN_PERCENT_BLACK: 'rgba(0, 0, 0, 0.1)',
  DARK_THEME_BACKGROUND: '#12202c',
  PRIMARY_DARK: '#1b2a39',
  PRIMARY_LIGHT: '#fafafa',
  PRIMARY_TEXT_DARK: 'rgba(255, 255, 255, 0.9)',
  PRIMARY_TEXT_LIGHT: 'rgba(0, 0, 0, 0.9)',
  SECONDARY_TEXT_DARK: 'rgba(255, 255, 255, 0.7)',
  SECONDARY_TEXT_LIGHT: 'rgba(0, 0, 0, 0.7)',
  SECONDARY: '#4177a5',
  DRAWER_WIDTH: 240,
  TONAL_OFFSET: 0.2,
};
export const CONTENT_MAX_WIDTH = 2000;

export const VALID_TASK =
  /^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$/;
export const TASKS_CREATE_STORAGE_KEY = 'tasks:create';
export const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
export const TASK_STATE = {
  COMPLETED: 'COMPLETED',
  RUNNING: 'RUNNING',
  FAILED: 'FAILED',
  PENDING: 'PENDING',
  EXCEPTION: 'EXCEPTION',
  UNSCHEDULED: 'UNSCHEDULED',
};
export const INTERACTIVE_TASK_STATUS = {
  WAITING: 'WAITING',
  RESOLVED: 'RESOLVED',
  READY: 'READY',
};
const SECOND = 1000;

export const INTERACTIVE_CONNECT_TASK_POLL_INTERVAL = 10 * SECOND;
export const TASK_POLL_INTERVAL = 60 * SECOND;
export const INITIAL_TASK_GROUP_NOTIFICATION_PREFERENCES = {
  groupNotifyTaskFailed: false,
  groupNotifySuccess: false,
};
export const TASK_ADDED_FIELDS = [
  'taskId',
  'decisionTask',
  'status',
  'latestArtifacts',
  'taskActions',
];
export const DOCS_PATH_PREFIX = '/docs';
export const DOCS_MENU_ITEMS = [
  {
    label: 'Getting Started',
    path: DOCS_PATH_PREFIX,
    hasChildren: false,
    icon: GestureTapIcon,
  },
  {
    label: 'Tutorial',
    path: `${DOCS_PATH_PREFIX}/tutorial`,
    hasChildren: false,
    icon: OneTwoThreeIcon,
  },
  {
    label: 'Manual',
    path: `${DOCS_PATH_PREFIX}/manual`,
    hasChildren: true,
    icon: BookOpenVariantIcon,
  },
  {
    label: 'Reference',
    path: `${DOCS_PATH_PREFIX}/reference`,
    hasChildren: true,
    icon: BookOpenOutlineIcon,
  },
  {
    label: 'People',
    path: `${DOCS_PATH_PREFIX}/people`,
    hasChildren: false,
    icon: AccountHeartOutlineIcon,
  },
  {
    label: 'Resources',
    path: `${DOCS_PATH_PREFIX}/resources`,
    hasChildren: false,
    icon: OpenInNewIcon,
  },
  {
    label: 'Changelog',
    path: `${DOCS_PATH_PREFIX}/changelog`,
    hasChildren: false,
    icon: ListStatusIcon,
  },
];

// Values the notify service accepts in notification-address.yml
export const DENYLIST_NOTIFICATION_TYPES = {
  EMAIL: 'email',
  PULSE: 'pulse',
  MATRIX_ROOM: 'matrix-room',
  SLACK_CHANNEL: 'slack-channel',
};

export const AUTH_STORE = '@@TASKCLUSTER_WEB_AUTH';
export const AUTH_STARTED = '@@TASKCLUSTER_AUTH_STARTED';
export const GROUP_NOTIFY_TASK_FAILED_KEY = 'group-notify-task-failed';
export const GROUP_NOTIFY_SUCCESS_KEY = 'group-notify-success';

// Worker Manager constants
export const NULL_PROVIDER = 'null-provider';
export const PROVIDER_DEFAULT_CONFIGS = new Map([
  // providerType : default config
  [
    'google',
    {
      minCapacity: 0,
      maxCapacity: 4,
      launchConfigs: [
        {
          region: 'us-west1',
          zone: 'us-west1-a',
          workerManager: {
            capacityPerInstance: 1,
          },
          disks: [
            {
              autoDelete: true,
              boot: true,
              initializeParams: '...',
              type: 'PERSISTENT',
            },
          ],
          machineType: 'zones/us-west1-a/machineTypes/n1-standard-8',
          networkInterfaces: [
            {
              accessConfigs: [
                {
                  type: 'ONE_TO_ONE_NAT',
                },
              ],
            },
          ],
          scheduling: {
            onHostMaintenance: 'terminate',
          },
          workerConfig: {
            shutdown: {
              enabled: true,
            },
          },
        },
      ],
    },
  ],
  ['static', {}],
  [
    'azure',
    {
      minCapacity: 0,
      maxCapacity: 4,
      launchConfigs: [
        {
          location: 'westus',
          workerManager: {
            capacityPerInstance: 1,
          },
          subnetId: '...',
          hardwareProfile: {
            vmSize: 'Basic_A1',
          },
          storageProfile: {
            imageReference: {
              id: '...',
            },
            osDisk: {
              caching: 'ReadWrite',
              managedDisk: {
                storageAccountType: 'Standard_LRS',
              },
              createOption: 'FromImage',
            },
          },
          workerConfig: {},
        },
      ],
    },
  ],
]);
export const NULL_WORKER_POOL = {
  workerPoolId: '/',
  providerId: '',
  description: '',
  owner: '',
  emailOnError: false,
  config: {},
};
export const UI_SCHEDULER_ID = 'taskcluster-ui';

const payloadCommand = [
  '/bin/bash',
  '-c',
  'for ((i=1;i<=60;i++)); do echo $i; sleep 1; done',
];

export const TASK_PAYLOAD_SCHEMAS = {
  'generic-insecure-posix': {
    label: 'Generic worker insecure posix',
    type: 'generic-worker',
    schema: 'insecure_posix.json',
    samplePayload: {
      command: [payloadCommand],
      maxRunTime: 60 + 30,
    },
  },
  'generic-multi-win': {
    label: 'Generic worker multiuser windows',
    type: 'generic-worker',
    schema: 'multiuser_windows.json',
    samplePayload: {
      command: ['dir'],
      maxRunTime: 60 + 30,
    },
  },
  'generic-multi-posix': {
    label: 'Generic worker multiuser posix',
    type: 'generic-worker',
    schema: 'multiuser_posix.json',
    samplePayload: {
      command: [payloadCommand],
      maxRunTime: 60 + 30,
    },
  },
};

// Same as `:first-child`, but ignores any <style> sibling
export const FIRST_CHILD = ':not(style):not(:not(style) ~ *)';
