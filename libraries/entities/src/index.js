const RowClass = require('./RowClass');

class Entity {
  constructor(options) {
    this.partitionKey = options.partitionKey;
    this.rowKey = options.rowKey;
    this.properties = options.properties;
    this.tableName = null;
    this.db = null;
    this.serviceName = null;
  }

  setup(options) {
    const { tableName, db, serviceName } = options;

    this.tableName = tableName;
    this.serviceName = serviceName;
    this.db = db;
  }

  // TODO: Fix this. This is totally wrong :-)
  calculateId(properties) {
    return `${properties[this.partitionKey]}${properties[this.rowKey]}`;
  }

  async create(properties, overwrite) {
    const documentId = this.calculateId(properties);

    let res;
    try {
      res = await this.db.procs[`${this.tableName}_create`](documentId, properties, overwrite, 1);
    } catch (err) {
      if (err.code !== '23505') {
        throw err;
      }
      const e = new Error('Entity already exists');
      e.code = 'EntityAlreadyExists';
      throw e;
    }

    const etag = res[0][`${this.tableName}_create`];

    return new RowClass(properties, { etag, tableName: this.tableName, documentId, db: this.db });
  }

  async removeTable() {
    try {
      await this.db.procs[`${this.tableName}_remove_table`]();
    } catch (err) {
      // 42P01 means undefined table
      if (err.code !== '42P01') {
        throw err;
      }

      const e = new Error('Resource not found');

      e.code = 'ResourceNotFound';
      e.statusCode = 404;
      throw e;
    }
  }

  /*
   Ensure existence of the underlying table
   */
  async ensureTable() {
    try {
      await this.db.procs[`${this.tableName}_ensure_table`]();
    } catch (err) {
      // 42P07 means duplicate table
      if (err.code !== '42P07') {
        throw err;
      }
    }
  }

  async remove(properties, ignoreIfNotExists) {
    const documentId = this.calculateId(properties);

    const [result] = await this.db.procs[`${this.tableName}_remove`](documentId);

    if (result) {
      return true;
    }

    if (ignoreIfNotExists && !result) {
      return false;
    }

    if (!result) {
      const err = new Error('Resource not found');

      err.code = 'ResourceNotFound';
      err.statusCode = 404;

      throw err;
    }
  }

  modify(properties) {
    const documentId = this.calculateId(properties);

    return this.db.procs[`${this.tableName}_modify`](documentId, properties, 1);
  }

  async load(properties, ignoreIfNotExists) {
    const documentId = this.calculateId(properties);
    const [result] = await this.db.procs[`${this.tableName}_load`](documentId);

    if (!result && ignoreIfNotExists) {
      return null;
    }

    if (!result) {
      const err = new Error('Resource not found');

      err.code = 'ResourceNotFound';
      err.statusCode = 404;
      throw err;
    }

    return new RowClass(properties, { etag: result.etag, tableName: this.tableName, documentId, db: this.db });
  }

  scan(condition, options = {}) {
    const {
      limit = 1000,
      page,
    } = options;
    return this.db.procs[`${this.tableName}_scan`](condition, limit, page);
  }

  query(conditions, options = {}) {
    return this.scan(conditions, options);
  }

  static configure(options) {
    return new Entity(options);
  }
}

module.exports = {
  Entity,
};
