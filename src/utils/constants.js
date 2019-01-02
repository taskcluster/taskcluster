import { fade } from '@material-ui/core/styles/colorManipulator';
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
import FileXmlIcon from 'mdi-react/FileXmlIcon';
import FileVideoIcon from 'mdi-react/FileVideoIcon';
import FileImageIcon from 'mdi-react/FileImageIcon';
import FileMusicIcon from 'mdi-react/FileMusicIcon';
import FileIcon from 'mdi-react/FileIcon';

// eslint-disable-next-line import/prefer-default-export
export const ARTIFACTS_PAGE_SIZE = 10;
export const TASK_GROUP_PAGE_SIZE = 1000;
export const VIEW_WORKER_TYPES_PAGE_SIZE = 50;
export const VIEW_WORKERS_PAGE_SIZE = 15;
export const VIEW_CLIENTS_PAGE_SIZE = 20;
export const VIEW_CLIENT_SCOPES_INSPECT_SIZE = 10;
export const VIEW_ROLES_PAGE_SIZE = 20;
export const VIEW_SECRETS_PAGE_SIZE = 100;
export const VIEW_NAMESPACES_PAGE_SIZE = 20;
export const VIEW_CACHE_PURGES_PAGE_SIZE = 20;
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
  DRAWER_WIDTH: 240,
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
export const INTERACTIVE_TASK_STATUS = {
  WAITING: 'WAITING',
  RESOLVED: 'RESOLVED',
  READY: 'READY',
};
export const TASK_GROUP_POLLING_INTERVAL = 150000; // 2.5 minutes
export const INTERACTIVE_CONNECT_TASK_POLL_INTERVAL = 10000; // 10 seconds
export const TASK_POLL_INTERVAL = 30000; // 30 seconds
export const VNC_DISPLAYS_POLLING_INTERVAL = 10000; // 10 seconds
export const INITIAL_CURSOR = '$$FIRST$$';
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
    FileXmlIcon,
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
  'taskGroup',
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
    label: 'Resources',
    path: `${DOCS_PATH_PREFIX}/resources`,
    hasChildren: false,
    icon: OpenInNewIcon,
  },
];
