import views from './views';

export default path => [
  {
    component: views.IndexedTask,
    path: `${path}/:namespace/:namespaceTaskId`,
  },
  {
    component: views.ListNamespaces,
    path: `${path}/:namespace?`,
  },
];
