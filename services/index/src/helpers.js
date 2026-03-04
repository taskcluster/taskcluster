import assert from 'assert';
import _ from 'lodash';
import { paginateResults } from '@taskcluster/lib-api';
import { UNIQUE_VIOLATION } from '@taskcluster/lib-postgres';
import { satisfiesExpression } from 'taskcluster-lib-scopes';

/** Regular expression for valid namespaces */
export const namespaceFormat = /^([a-zA-Z0-9_!~*'()%-]+\.)*[a-zA-Z0-9_!~*'()%-]+$/;

const makeError = (message, code, statusCode) => {
  const err = new Error(message);
  err.code = code;
  err.name = `${code}Error`;
  err.statusCode = statusCode;
  return err;
};

export const make404 = () => makeError('Resource not found', 'ResourceNotFound', 404);

export const taskUtils = {
  // Create a single instance, or undefined, from a set of rows containing zero
  // or one elements.
  fromDbRows(rows) {
    if (rows.length === 1) {
      return taskUtils.fromDb(rows[0]);
    }
  },
  // Create a single instance from a DB row
  fromDb(row) {
    return {
      namespace: row.namespace,
      name: row.name,
      rank: row.rank,
      taskId: row.task_id,
      data: row.data,
      expires: row.expires,
    };
  },
  // Create a serializable representation of this indexed task suitable for response
  // from an API method.
  serialize(task) {
    let ns = task.namespace + '.' + task.name;
    // Remove separate if there is no need
    if (task.namespace.length === 0 || task.name.length === 0) {
      ns = task.namespace + task.name;
    }

    return {
      namespace: ns,
      taskId: task.taskId,
      rank: task.rank,
      data: _.cloneDeep(task.data),
      expires: task.expires.toJSON(),
    };
  },
  /**
   * Insert task into `namespace` where:
   *
   * input:
   * {
   *   expires:      // Date object
   *   data:         // IndexedTask.data or JSON date string
   *   taskId:       // TaskId for task
   *   rank:         // IndexedTask.rank
   * }
   *
   */
  async insertTask(db, fullNamespace, input) {
    // Validate input
    assert(input.expires instanceof Date, 'expires must be a Date object');
    assert(input.data instanceof Object, 'data must be an object');
    assert(input.taskId, 'taskId must be given');
    assert(typeof input.rank === 'number', 'rank must be a number');
    assert(db,
      'db must be set');

    let [namespace, name] = splitNamespace(fullNamespace);

    // Find expiration time and parse as date object
    let expires = new Date(input.expires);

    // Attempt to load indexed task
    let task = taskUtils.fromDbRows(await db.fns.get_indexed_task(namespace, name));

    if (!task) {
      // Create namespace hierarchy
      await namespaceUtils.ensureNamespace(db, namespace, expires);

      // Create indexed task
      try {
        await db.fns.create_indexed_task(
          namespace,
          name,
          input.rank,
          input.taskId,
          input.data,
          expires,
        );
        return {
          namespace,
          name,
          rank: input.rank,
          taskId: input.taskId,
          data: input.data,
          expires,
        };
      } catch (err) {
        // Load indexed task if it was constructed while we waited
        if (err && err.code === UNIQUE_VIOLATION) {
          task = taskUtils.fromDbRows(await db.fns.get_indexed_task(namespace, name));
        } else {
          throw err;
        }
      }
    }

    // Update if we prefer input over what we have
    if (task.rank <= input.rank) {
      const updatedTask = await db.fns.update_indexed_task(
        task.namespace,
        task.name,
        input.rank,
        input.taskId,
        input.data,
        expires,
      );

      await namespaceUtils.ensureNamespace(db, namespace, expires);

      return taskUtils.fromDbRows(updatedTask);
    } else {
      return task;
    }
  },
  // Call db.get_indexed_tasks with named arguments.
  // You will get a list of up to 1000 entries and a
  // continuation token.
  // The response will be of the form { rows, continationToken }.
  // If there are no indexed tasks to show, the response will have the
  // `rows` field set to an empty array.
  async getIndexedTasks(
    db,
    { namespace, name },
    {
      query,
    } = {},
  ) {
    const fetchResults = async (continuation) => {
      let q = query;

      if (continuation) {
        q.continuationToken = continuation;
      }

      const { continuationToken, rows } = await paginateResults({
        query: q,
        fetch: (size, offset) => db.fns.get_indexed_tasks(
          namespace || namespace === '' ? namespace : null,
          name || name === '' ? name : null,
          size,
          offset,
        ),
      });

      const entries = rows.map(taskUtils.fromDb);

      return { rows: entries, continuationToken: continuationToken };
    };

    // Fetch results
    return fetchResults(query ? query.continuationToken : {});
  },

  async findTasksAtIndexes(db, { indexes }, { query } = {}) {
    assert(_.isArray(indexes), 'indexes must be an Array');
    for (let index of indexes) {
      assert(_.isString(index), 'index must be a String');
    }
    const fetchResults = async (continuation) => {
      let q = query;

      if (continuation) {
        q.continuationToken = continuation;
      }

      const { continuationToken, rows } = await paginateResults({
        query: q,
        fetch: (size, offset) => db.fns.get_tasks_from_indexes_and_namespaces(
          JSON.stringify(indexes),
          size,
          offset,
        ),
      });

      const tasks = rows.map(taskUtils.fromDb);
      return { tasks, continuationToken };
    };

    // Fetch results
    return fetchResults(query ? query.continuationToken : {});
  },
};

export const namespaceUtils = {
  // Create a single instance, or undefined, from a set of rows containing zero
  // or one elements.
  fromDbRows(rows) {
    if (rows.length === 1) {
      return namespaceUtils.fromDb(rows[0]);
    }
  },
  // Create a single instance from a DB row
  fromDb(row) {
    return {
      parent: row.parent,
      name: row.name,
      expires: row.expires,
    };
  },
  // Create a serializable representation of this namespace suitable for response
  // from an API method.
  serialize(indexNamespace) {
    let ns = indexNamespace.parent + '.' + indexNamespace.name;
    // Remove separate if there is no need
    if (indexNamespace.parent.length === 0 || indexNamespace.name.length === 0) {
      ns = indexNamespace.parent + indexNamespace.name;
    }
    return {
      namespace: ns,
      name: indexNamespace.name,
      expires: indexNamespace.expires.toJSON(),
    };
  },
  // Call db.get_index_namespaces with named arguments.
  // You will get a list of up to 1000 entries and a
  // continuation token.
  // The response will be of the form { rows, continationToken }.
  // If there are no namespaces to show, the response will have the
  // `rows` field set to an empty array.
  //
  async getNamespaces(
    db,
    { parent, name },
    {
      query,
    } = {},
  ) {
    const fetchResults = async (continuation) => {
      let q = query;

      if (continuation) {
        q.continuationToken = continuation;
      }

      const { continuationToken, rows } = await paginateResults({
        query: q,
        fetch: (size, offset) => db.fns.get_index_namespaces(
          parent || parent === '' ? parent : null,
          name || name === '' ? name : null,
          size,
          offset,
        ),
      });

      const entries = rows.map(namespaceUtils.fromDb);

      return { rows: entries, continuationToken: continuationToken };
    };

    // Fetch results
    return fetchResults(query ? query.continuationToken : {});
  },
  /** Create parent structure */
  async ensureNamespace(db, namespace, expires) {
    // Stop recursion at root
    if (namespace.length === 0) {
      return Promise.resolve(null);
    }

    // Round to date to avoid updating all the time
    expires = new Date(
      expires.getFullYear(),
      expires.getMonth(),
      expires.getDate() + 1,
      0, 0, 0, 0,
    );

    // Parse namespace
    if (!(namespace instanceof Array)) {
      namespace = namespace.split('.');
    }
    // Find parent and folder name
    let name = namespace.pop() || '';
    let parent = namespace.join('.');

    // Load namespace, to check if it exists and if we should update expires
    const folder = taskUtils.fromDbRows(await db.fns.get_index_namespace(parent, name));

    if (folder) {
      // Modify the namespace
      if (folder.expires < expires) {
        // Update all parents first though
        await namespaceUtils.ensureNamespace(db, namespace, expires);
        // Update expires
        const updatedNamespace = await db.fns.update_index_namespace(parent, name, expires);

        return taskUtils.fromDbRows(updatedNamespace);
      }

      return folder;
    } else {
      // Create parent namespaces
      await namespaceUtils.ensureNamespace(
        db,
        namespace,
        expires,
      );
      // Create namespace
      try {
        await db.fns.create_index_namespace(parent, name, expires);
      } catch (err) {
        // Re-throw error if it's not because the entity was constructed while we
        // waited
        if (!err || err.code !== UNIQUE_VIOLATION) {
          throw err;
        }

        const namespace = await db.fns.get_index_namespace(parent, name);

        return namespaceUtils.fromDbRows(namespace);
      }
    }
  },
};

/**
 * Given a namespace, split off the final component as a name, and
 * the rest as the parent namespace.  A value with no `.` is considered
 * to be a name in the root namespace.
 */
export const splitNamespace = namespace => {
  // Get namespace and ensure that we have a least one dot
  namespace = namespace.split('.');

  // Find name and namespace
  const name = namespace.pop() || '';
  namespace = namespace.join('.');

  return [namespace, name];
};

const satisfiesArtifactScope = async (anonymousScopeCache, artifactName) => {
  try {
    const scopes = await anonymousScopeCache();
    return satisfiesExpression(scopes, `queue:get-artifact:${artifactName}`);
  } catch {
    return false;
  }
};

export { satisfiesArtifactScope as _satisfiesArtifactScope };

const ANONYMOUS_SCOPE_CACHE_TTL = 5 * 60 * 1000;

const isPublicArtifact = (auth) => {
  let cachedScopes = null;
  let cachedAt = 0;

  const anonymousScopeCache = async () => {
    const now = Date.now();
    if (cachedScopes && (now - cachedAt) < ANONYMOUS_SCOPE_CACHE_TTL) {
      return cachedScopes;
    }
    const result = await auth.expandScopes({ scopes: ['assume:anonymous'] });
    cachedScopes = result.scopes;
    cachedAt = Date.now();
    return cachedScopes;
  };

  return (artifactName) => satisfiesArtifactScope(anonymousScopeCache, artifactName);
};

export default { taskUtils, namespaceUtils, splitNamespace, namespaceFormat, isPublicArtifact };
