import { alpha } from '@material-ui/core/styles';
import GestureTapIcon from 'mdi-react/GestureTapIcon';
import OneTwoThreeIcon from 'mdi-react/OneTwoThreeIcon';
import BookOpenVariantIcon from 'mdi-react/BookOpenVariantIcon';
import BookOpenOutlineIcon from 'mdi-react/BookOpenOutlineIcon';
import OpenInNewIcon from 'mdi-react/OpenInNewIcon';
import FileDocumentIcon from 'mdi-react/FileDocumentIcon';
import FilePdfIcon from 'mdi-react/FilePdfIcon';
import ArchiveIcon from 'mdi-react/ArchiveIcon';
import FileWordIcon from 'mdi-react/FileWordIcon';
import FileExcelIcon from 'mdi-react/FileExcelIcon';
import FilePowerpointIcon from 'mdi-react/FilePowerpointIcon';
import FileCodeIcon from 'mdi-react/FileCodeIcon';
import FileVideoIcon from 'mdi-react/FileVideoIcon';
import FileImageIcon from 'mdi-react/FileImageIcon';
import FileMusicIcon from 'mdi-react/FileMusicIcon';
import FileIcon from 'mdi-react/FileIcon';
import ListStatusIcon from 'mdi-react/FormatListChecksIcon';
import AccountHeartOutlineIcon from 'mdi-react/AccountHeartOutlineIcon';

// eslint-disable-next-line import/prefer-default-export
export const ARTIFACTS_SHOW_MAX = 10;
export const ARTIFACTS_PAGE_SIZE = 1000;
export const DEPENDENTS_PAGE_SIZE = 25;
export const TASK_GROUP_PAGE_SIZE = 1000;
export const VIEW_WORKER_TYPES_PAGE_SIZE = 1000;
export const VIEW_WORKERS_PAGE_SIZE = 1000;
export const VIEW_WORKER_POOLS_PAGE_SIZE = 1000;
export const VIEW_WORKER_POOL_LAUNCH_CONFIG_PAGE_SIZE = 1000;
export const VIEW_WORKER_POOL_ERRORS_PAGE_SIZE = 100;
export const VIEW_WORKER_POOL_PENDING_TASKS_PAGE_SIZE = 100;
export const VIEW_CLIENTS_PAGE_SIZE = 1000;
export const VIEW_CLIENT_SCOPES_INSPECT_SIZE = 10;
export const VIEW_ROLES_PAGE_SIZE = 1000;
export const VIEW_SECRETS_PAGE_SIZE = 1000;
export const VIEW_DENYLIST_PAGE_SIZE = 20;
export const VIEW_NAMESPACES_PAGE_SIZE = 20;
export const VIEW_CACHE_PURGES_PAGE_SIZE = 1000;
export const HOOKS_LAST_FIRE_TYPE = {
  NO_FIRE: 'NoFire',
  SUCCESSFUL_FIRE: 'HookSuccessfulFire',
  FAILED_FIRE: 'HookFailedFire',
};

export const THEME = {
  WHITE: '#fff',
  BLACK: '#000',
  TEN_PERCENT_WHITE: alpha('#fff', 0.1),
  TEN_PERCENT_BLACK: alpha('#000', 0.1),
  DARK_THEME_BACKGROUND: '#12202c',
  PRIMARY_DARK: '#1b2a39',
  PRIMARY_LIGHT: '#fafafa',
  PRIMARY_TEXT_DARK: 'rgba(255, 255, 255, 0.9)',
  PRIMARY_TEXT_LIGHT: 'rgba(0, 0, 0, 0.9)',
  SECONDARY_TEXT_DARK: 'rgba(255, 255, 255, 0.7)',
  SECONDARY_TEXT_LIGHT: 'rgba(0, 0, 0, 0.7)',
  SECONDARY: '#4177a5',
  DRAWER_WIDTH: 240,
  DIVIDER: 'rgba(0, 0, 0, 0.12)',
  TONAL_OFFSET: 0.2,
};
export const CONTENT_MAX_WIDTH = 2000;

// eslint-disable-next-line max-len
export const VALID_TASK = /^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$/;
export const TASKS_CREATE_STORAGE_KEY = 'tasks:create';
export const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;
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
export const VNC_DISPLAYS_POLLING_INTERVAL = 10 * SECOND;
export const INITIAL_CURSOR = '$$FIRST$$';
export const INITIAL_TASK_GROUP_NOTIFICATION_PREFERENCES = {
  groupNotifyTaskFailed: false,
  groupNotifySuccess: false,
};
export const MIMETYPE_ICONS = [
  [FilePdfIcon, ['application/pdf', 'application/postscript']],
  [
    ArchiveIcon,
    [
      'application/zip',
      'application/gzip',
      'application/x-tar',
      'application/x-gzip',
      'application/x-bzip2',
      'application/x-lzip',
      'application/x-lzma',
      'application/x-lzop',
      'application/x-xz',
      'application/x-compress',
      'application/x-apple-diskimage',
      'application/vnd.ms-cab-compressed',
      'application/vnd.android.package-archive',
      'application/x-gtar',
      /compressed/,
      /tar/,
      /zip/,
    ],
  ],
  [FileWordIcon, ['text/rtf', 'text/html']],
  [FileExcelIcon, ['text/csv']],
  [FilePowerpointIcon, []],
  [
    FileCodeIcon,
    [
      'application/javascript',
      'application/json',
      'application/xml',
      'text/css',
      'text/javascript',
      'text/xml',
      'application/ecmascript',
    ],
  ],
  [FileVideoIcon, [/^video\//]],
  [FileImageIcon, [/^image\//]],
  [FileDocumentIcon, [/^text\//]],
  [FileMusicIcon, [/^audio\//]],
  [FileIcon, [/.*/]],
];
export const ACTIONS_JSON_KNOWN_KINDS = ['task', 'hook'];
// Before doing a mutation on a task, be sure to
// remove parent fields added by the GraphQL gateway.
export const TASK_ADDED_FIELDS = [
  'taskId',
  'decisionTask',
  'status',
  'latestArtifacts',
  'taskActions',
];
export const ACTION_CONTEXT = {
  PROVISIONER: 'PROVISIONER',
  WORKER_TYPE: 'WORKER_TYPE',
  WORKER: 'WORKER',
};
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

export const DENYLIST_NOTIFICATION_TYPES = {
  EMAIL: 'EMAIL',
  PULSE: 'PULSE',
  MATRIX_ROOM: 'MATRIX_ROOM',
  SLACK_CHANNEL: 'SLACK_CHANNEL',
};

export const KNOWN_ACRONYMS = ['IRC', 'API'];
export const AUTH_STORE = '@@TASKCLUSTER_WEB_AUTH';
export const AUTH_STARTED = '@@TASKCLUSTER_AUTH_STARTED';
// The delay (in milliseconds) for `setTimeout` is a 32 bit signed quantity,
// which limits it to 2^31-1 ms (2147483647 ms) or 24.855 days.
export const MAX_SET_TIMEOUT_DELAY = 2 ** 31 - 1;
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
  'docker-worker': {
    label: 'Docker worker',
    type: 'docker-worker',
    schema: 'v1/payload.json',
    samplePayload: {
      image: 'ubuntu:latest',
      command: payloadCommand,
      maxRunTime: 60 + 30,
    },
  },
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
