const _ = require('lodash');
const assert = require('assert').strict;
const taskcluster = require('taskcluster-client');
const {UNIQUE_VIOLATION} = require('taskcluster-lib-postgres');
const helpers = require('./helpers');
const { paginateResults } = require('taskcluster-lib-api');

const makeError = (message, code, statusCode) => {
  const err = new Error(message);
  err.code = code;
  err.name = `${code}Error`;
  err.statusCode = statusCode;
  return err;
};

const make404 = () => makeError('Resource not found', 'ResourceNotFound', 404);

class IndexedTask {
  // (private constructor)
  constructor(props) {
    Object.assign(this, props);

    this._properties = props;
  }

  // Create a single instance from a DB row
  static fromDb(row) {
    return new IndexedTask({
      namespace: row.namespace,
      name: row.name,
      rank: row.rank,
      taskId: row.task_id,
      data: row.data,
      expires: row.expires,
      etag: row.etag,
    });
  }

  // Create a single instance, or undefined, from a set of rows containing zero
  // or one elements.  This matches the semantics of get_indexed_task.
  static fromDbRows(rows) {
    if (rows.length === 1) {
      return IndexedTask.fromDb(rows[0]);
    }
  }

  // Create an instance from API arguments, with default values applied.
  static fromApi(input) {
    return new IndexedTask({
      expires: taskcluster.fromNow('1 week'),
      ...input,
    });
  }

  // Get an indexed task from the DB.
  // Throws a 404 if it does not exist.
  static async get(db, { namespace, name }) {
    const row = IndexedTask.fromDbRows(await db.fns.get_indexed_task(namespace, name));

    if (!row) {
      throw make404();
    }

    return row;
  }

  // Expire indexed tasks,
  // returning the count of indexed tasks expired.
  static async expire({db, monitor}) {
    return (await db.fns.expire_indexed_tasks())[0].expire_indexed_tasks;
  }

  // Call db.create_indexed_task with the content of this instance.  This
  // implements the usual idempotency checks and returns an error with code
  // UNIQUE_VIOLATION when those checks fail.
  async create(db) {
    try {
      const etag = (await db.fns.create_indexed_task(
        this.namespace,
        this.name,
        this.rank,
        this.taskId,
        this.data,
        this.expires,
      ))[0].create_indexed_task;

      return new IndexedTask({
        namespace: this.namespace,
        name: this.name,
        rank: this.rank,
        taskId: this.taskId,
        data: this.data,
        expires: this.expires,
        etag,
      });
    } catch (err) {
      if (err.code !== UNIQUE_VIOLATION) {
        throw err;
      }
      const existing = await IndexedTask.get(db, {
        namespace: this.namespace,
        name: this.name,
      });

      if (!this.equals(existing)) {
        // new indexed task does not match, so this is a "real" conflict
        throw err;
      }

      return existing;
    }
  }

  // Create a serializable representation of this indexed task suitable for response
  // from an API method.
  serializable() {
    let ns = this.namespace + '.' + this.name;
    // Remove separate if there is no need
    if (this.namespace.length === 0 || this.name.length === 0) {
      ns = this.namespace + this.name;
    }
    return {
      namespace: ns,
      taskId: this.taskId,
      rank: this.rank,
      data: _.cloneDeep(this.data),
      expires: this.expires.toJSON(),
    };
  }

  // Calls db.update_indexed_task given a modifier.
  // This function shouldn't have side-effects (or these should be contained),
  // as the modifier may be called more than once, if the update operation fails.
  // This method will apply modifier to a clone of the current data and attempt
  // to save it. But if this fails because the entity have been updated by
  // another process (the etag is out of date), it'll reload the row
  // from the indexed_tasks table, invoke the modifier again, and try to save again.
  //
  // Returns the updated IndexedTask instance if successful. Otherwise, it will return
  // * a 404 if it fails to locate the row to update
  // * a 409 if the number of retries reaches MAX_MODIFY_ATTEMPTS
  //
  // Note: modifier is allowed to return a promise.
  async update(db, modifier) {
    let attemptsLeft = helpers.MAX_MODIFY_ATTEMPTS;

    const attemptModify = async () => {
      const newProperties = _.cloneDeep(this._properties);
      let result;
      await modifier.call(newProperties, newProperties);

      if (!_.isEqual(newProperties, this._properties)) {
        try {
          [result] = await db.fns.update_indexed_task(
            newProperties.namespace,
            newProperties.name,
            newProperties.rank,
            newProperties.taskId,
            newProperties.data,
            newProperties.expires,
            newProperties.etag,
          );

          const indexedTask = IndexedTask.fromDb(result);
          this.updateInstanceFields(indexedTask);
        } catch (e) {
          if (e.code === 'P0004') {
            return null;
          }

          if (e.code === 'P0002') {
            throw make404();
          }

          throw e;
        }
      }

      return this;
    };

    let result;
    while (attemptsLeft--) {
      result = await attemptModify();

      if (result) {
        break;
      }

      await this.reload(db);
    }

    if (attemptsLeft <= 0) {
      throw makeError('MAX_MODIFY_ATTEMPTS exhausted, check for congestion', 'EntityWriteCongestionError', 409);
    }

    return result;
  }

  updateInstanceFields(indexedTask) {
    Object.keys(indexedTask).forEach(prop => {
      this[prop] = indexedTask[prop];
    });

    this._properties = indexedTask;
  }

  // Load the properties from the table once more, and update the instance fields.
  async reload(db) {
    const indexedTask = await IndexedTask.get(db, {
      namespace: this.namespace,
      name: this.name,
    });

    this.updateInstanceFields(indexedTask);
  }

  // Call db.get_indexed_tasks with named arguments.
  // You can use this in two ways: with a handler or without a handler.
  // In the latter case you'll get a list of up to 1000 entries and a
  // continuation token.
  // The response will be of the form { rows, continationToken }.
  // If there are no indexed tasks to show, the response will have the
  // `rows` field set to an empty array.
  //
  // If a handler is supplied, then it will invoke the handler
  // on every item of the scan.
  static async getIndexedTasks(
    db,
    { namespace, name },
    {
      query,
      handler,
    } = {},
  ) {
    assert(!handler || handler instanceof Function,
      'If options.handler is given it must be a function');
    const fetchResults = async (continuation) => {
      let q = query;

      if (continuation) {
        q.continuationToken = continuation;
      }

      const {continuationToken, rows} = await paginateResults({
        query: q,
        fetch: (size, offset) => db.fns.get_indexed_tasks(
          namespace || namespace === '' ? namespace : null,
          name || name === '' ? name : null,
          size,
          offset,
        ),
      });

      const entries = rows.map(IndexedTask.fromDb);

      return { rows: entries, continuationToken: continuationToken };
    };

    // Fetch results
    let results = await fetchResults(query ? query.continuationToken : {});

    // If we have a handler, then we have to handle the results
    if (handler) {
      const handleResults = async (res) => {
        await Promise.all(res.rows.map((item) => handler.call(this, item)));

        if (res.continuationToken) {
          return await handleResults(await fetchResults(res.continuationToken));
        }
      };
      results = await handleResults(results);
    }
    return results;
  }

  // Compare "important" fields to another worker (used to check idempotency)
  equals(other) {
    const fields = [
      'namespace',
      'name',
      'taskId',
      'expires',
    ];
    return _.isEqual(_.pick(other, fields), _.pick(this, fields));
  }
}

// Export IndexedTask
exports.IndexedTask = IndexedTask;

class Namespace {
  // (private constructor)
  constructor(props) {
    Object.assign(this, props);

    this._properties = props;
  }

  // Create a single instance from a DB row
  static fromDb(row) {
    return new Namespace({
      parent: row.parent,
      name: row.name,
      expires: row.expires,
      etag: row.etag,
    });
  }

  // Create a single instance, or undefined, from a set of rows containing zero
  // or one elements.  This matches the semantics of get_namespace.
  static fromDbRows(rows) {
    if (rows.length === 1) {
      return Namespace.fromDb(rows[0]);
    }
  }

  // Create an instance from API arguments, with default values applied.
  static fromApi(input) {
    return new Namespace({
      expires: taskcluster.fromNow('1 week'),
      ...input,
    });
  }

  // Get a namespace from the DB.
  // Throws a 404 if it does not exist.
  static async get(db, { parent, name }) {
    const row = Namespace.fromDbRows(await db.fns.get_namespace(parent, name));

    if (!row) {
      throw make404();
    }

    return row;
  }

  // Expire namespaces,
  // returning the count of namespaces expired.
  static async expire({db, monitor}) {
    return (await db.fns.expire_namespaces())[0].expire_namespaces;
  }

  // Call db.create_namespace with the content of this instance.  This
  // implements the usual idempotency checks and returns an error with code
  // UNIQUE_VIOLATION when those checks fail.
  async create(db) {
    try {
      const etag = (await db.fns.create_namespace(
        this.parent,
        this.name,
        this.expires,
      ))[0].create_namespace;

      return new Namespace({
        parent: this.parent,
        name: this.name,
        expires: this.expires,
        etag,
      });
    } catch (err) {
      if (err.code !== UNIQUE_VIOLATION) {
        throw err;
      }
      const existing = await Namespace.get(db, {
        parent: this.parent,
        name: this.name,
      });

      if (!this.equals(existing)) {
        // new namespace does not match, so this is a "real" conflict
        throw err;
      }

      return existing;
    }
  }

  // Create a serializable representation of this namespace suitable for response
  // from an API method.
  serializable() {
    let ns = this.parent + '.' + this.name;
    // Remove separate if there is no need
    if (this.parent.length === 0 || this.name.length === 0) {
      ns = this.parent + this.name;
    }
    return {
      namespace: ns,
      name: this.name,
      expires: this.expires.toJSON(),
    };
  }

  // Calls db.update_namespace given a modifier.
  // This function shouldn't have side-effects (or these should be contained),
  // as the modifier may be called more than once, if the update operation fails.
  // This method will apply modifier to a clone of the current data and attempt
  // to save it. But if this fails because the entity have been updated by
  // another process (the etag is out of date), it'll reload the row
  // from the namespaces table, invoke the modifier again, and try to save again.
  //
  // Returns the updated Namespace instance if successful. Otherwise, it will return
  // * a 404 if it fails to locate the row to update
  // * a 409 if the number of retries reaches MAX_MODIFY_ATTEMPTS
  //
  // Note: modifier is allowed to return a promise.
  async update(db, modifier) {
    let attemptsLeft = helpers.MAX_MODIFY_ATTEMPTS;

    const attemptModify = async () => {
      const newProperties = _.cloneDeep(this._properties);
      let result;
      await modifier.call(newProperties, newProperties);

      if (!_.isEqual(newProperties, this._properties)) {
        try {
          [result] = await db.fns.update_namespace(
            newProperties.parent,
            newProperties.name,
            newProperties.expires,
            newProperties.etag,
          );

          const indexedTask = Namespace.fromDb(result);
          this.updateInstanceFields(indexedTask);
        } catch (e) {
          if (e.code === 'P0004') {
            return null;
          }

          if (e.code === 'P0002') {
            throw make404();
          }

          throw e;
        }
      }

      return this;
    };

    let result;
    while (attemptsLeft--) {
      result = await attemptModify();

      if (result) {
        break;
      }

      await this.reload(db);
    }

    if (attemptsLeft <= 0) {
      throw makeError('MAX_MODIFY_ATTEMPTS exhausted, check for congestion', 'EntityWriteCongestionError', 409);
    }

    return result;
  }

  updateInstanceFields(indexedTask) {
    Object.keys(indexedTask).forEach(prop => {
      this[prop] = indexedTask[prop];
    });

    this._properties = indexedTask;
  }

  // Load the properties from the table once more, and update the instance fields.
  async reload(db) {
    const indexedTask = await Namespace.get(db, {
      parent: this.parent,
      name: this.name,
    });

    this.updateInstanceFields(indexedTask);
  }

  // Call db.get_namespaces with named arguments.
  // You can use this in two ways: with a handler or without a handler.
  // In the latter case you'll get a list of up to 1000 entries and a
  // continuation token.
  // The response will be of the form { rows, continationToken }.
  // If there are no namespaces to show, the response will have the
  // `rows` field set to an empty array.
  //
  // If a handler is supplied, then it will invoke the handler
  // on every item of the scan.
  static async getNamespaces(
    db,
    { parent, name },
    {
      query,
      handler,
    } = {},
  ) {
    assert(!handler || handler instanceof Function,
      'If options.handler is given it must be a function');
    const fetchResults = async (continuation) => {
      let q = query;

      if (continuation) {
        q.continuationToken = continuation;
      }

      const {continuationToken, rows} = await paginateResults({
        query: q,
        fetch: (size, offset) => db.fns.get_namespaces(
          parent || parent === '' ? parent : null,
          name || name === '' ? name : null,
          size,
          offset,
        ),
      });

      const entries = rows.map(Namespace.fromDb);

      return { rows: entries, continuationToken: continuationToken };
    };

    // Fetch results
    let results = await fetchResults(query ? query.continuationToken : {});

    // If we have a handler, then we have to handle the results
    if (handler) {
      const handleResults = async (res) => {
        await Promise.all(res.rows.map((item) => handler.call(this, item)));

        if (res.continuationToken) {
          return await handleResults(await fetchResults(res.continuationToken));
        }
      };
      results = await handleResults(results);
    }
    return results;
  }

  // Compare "important" fields to another worker (used to check idempotency)
  equals(other) {
    const fields = [
      'parent',
      'name',
      'expires',
    ];
    return _.isEqual(_.pick(other, fields), _.pick(this, fields));
  }

  /** Create parent structure */
  static ensureNamespace(db, namespace, expires) {
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
    return Namespace.get(db, {
      parent: parent,
      name: name,
    }).then(function(folder) {
      // Modify the namespace
      return folder.update(db, function() {
        // Check if we need to update expires
        if (this.expires < expires) {
          // Update expires
          this.expires = expires;

          // Update all parents first though
          return Namespace.ensureNamespace(db, namespace, expires);
        }
      });
    }, function(err) {
      // Re-throw exception, if it's not because the namespace is missing
      if (!err || err.code !== 'ResourceNotFound') {
        throw err;
      }

      // Create parent namespaces
      return Namespace.ensureNamespace(
        db,
        namespace,
        expires,
      ).then(function() {
        // Create namespace
        const namespace = Namespace.fromApi({
          parent: parent,
          name: name,
          expires: expires,
        });

        return namespace.create(db).then(null, async function(err) {
          // Re-throw error if it's not because the entity was constructed while we
          // waited
          if (!err || err.code !== UNIQUE_VIOLATION) {
            throw err;
          }

          return Namespace.get(db, {
            parent: parent,
            name: name,
          });
        });
      });
    });
  }
}

// Export Namespace
exports.Namespace = Namespace;
