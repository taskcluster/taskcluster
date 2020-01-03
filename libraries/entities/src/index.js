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

  create(properties, overwrite) {
    const documentId = this.calculateId(properties);

    return this.db.procs[`${this.tableName}_create`](documentId, properties, overwrite, 1);
  }

  delete(properties) {
    const documentId = this.calculateId(properties);

    return this.db.procs[`${this.tableName}_delete`](documentId);
  }

  update(properties) {
    const documentId = this.calculateId(properties);

    return this.db.procs[`${this.tableName}_update`](documentId, properties, 1);
  }

  load(properties) {
    const documentId = this.calculateId(properties);

    return this.db.procs[`${this.tableName}_load`](documentId);
  }

  static configure(options) {
    return new Entity(options);
  }
}

module.exports = {
  Entity,
};
