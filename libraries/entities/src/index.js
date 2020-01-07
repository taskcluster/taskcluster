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

  remove(properties) {
    const documentId = this.calculateId(properties);

    return this.db.procs[`${this.tableName}_remove`](documentId);
  }

  modify(properties) {
    const documentId = this.calculateId(properties);

    return this.db.procs[`${this.tableName}_modify`](documentId, properties, 1);
  }

  load(properties) {
    const documentId = this.calculateId(properties);

    return this.db.procs[`${this.tableName}_load`](documentId);
  }

  scan({ condition, limit, page } = {}) {
    return this.db.procs[`${this.tableName}_scan`](condition, limit, page);
  }

  static configure(options) {
    return new Entity(options);
  }
}

module.exports = {
  Entity,
};
