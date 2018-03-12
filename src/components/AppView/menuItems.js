export default [
  {
    label: 'Documentation',
    // icon: LocalLibrary,
    key: 'taskcluster-documentation',
    items: [
      {
        key: 'taskcluster-tutorial',
        label: 'Tutorial',
        to: '/tutorial'
        // icon: Accessibility
      },
      {
        key: 'taskcluster-reference',
        // icon: ChromeReaderMode,
        to: '/references',
        label: 'Reference'
      },
      {
        key: 'taskcluster-resources',
        // icon: HelpOutline,
        label: 'Resources',
        to: '/resources'
      },
      {
        key: 'taskcluster-people',
        // icon: PersonPin,
        label: 'People',
        to: '/people'
      }
    ]
  },
  {
    key: 'taskcluster-tasks',
    defaultVisible: true,
    label: 'Tasks',
    // icon: PlayForWork,
    items: [
      {
        key: 'taskcluster-create-task',
        // icon: AddCircleOutline,
        to: '/tasks/create',
        label: 'Create task'
      },
      {
        key: 'taskcluster-task-groups',
        // icon: GroupWork,
        to: '/groups',
        label: 'Inspect task(s)'
      }
    ]
  },
  {
    key: 'taskcluster-entities',
    defaultVisible: true,
    label: 'Provisioners',
    // icon: CloudQueue,
    items: [
      {
        key: 'taskcluster-provisioners',
        // icon: Assignment,
        to: '/provisioners',
        label: 'Provisioners'
      },
      {
        key: 'taskcluster-aws-provisioner',
        // icon: Cloud,
        to: '/aws-provisioner',
        label: 'AWS Provisioner'
      },
      {
        key: 'taskcluster-cache-purge',
        // icon: Delete,
        to: '/pulse-caches',
        label: 'Purge Caches'
      }
    ]
  },
  {
    key: 'taskcluster-authentication',
    label: 'Authentication',
    // icon: PermIdentity,
    items: [
      {
        key: 'taskcluster-authentication-clients',
        // icon: AddCircleOutline,
        to: '/auth/clients',
        label: 'Client Manager'
      },
      {
        key: 'taskcluster-authentication-roles',
        // icon: WebAsset,
        to: '/auth/roles',
        label: 'Role Manager'
      },
      {
        key: 'taskcluster-authentication-scopes',
        // icon: FindInPage,
        to: '/auth/scopes',
        label: 'Scope Inspector'
      },
      {
        key: 'taskcluster-authentication-grants',
        // icon: AddToQueue,
        to: '/auth/grants',
        label: 'Scope Grants'
      }
    ]
  },
  {
    key: 'taskcluster-core-services',
    label: 'Core Services',
    // icon: FiberManualRecord,
    items: [
      {
        key: 'taskcluster-hooks',
        // icon: CompareArrows,
        to: '/hooks',
        label: 'Hooks'
      },
      {
        key: 'taskcluster-secrets',
        // icon: LockOutline,
        to: '/secrets',
        label: 'Secrets'
      },
      {
        key: 'taskcluster-indexed-tasks',
        // icon: LowPriority,
        to: '/index',
        label: 'Indexed Tasks'
      },
      {
        key: 'taskcluster-indexed-artifacts',
        // icon: Attachment,
        to: '/index/artifacts',
        label: 'Indexed Artifacts'
      }
    ]
  },
  {
    key: 'taskcluster-pulse-exchanges',
    label: 'Pulse exchanges',
    to: '/pulse-inspector'
    // icon: Message
  }
];
