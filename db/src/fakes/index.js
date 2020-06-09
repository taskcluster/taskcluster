const fs = require('fs');
const {WRITE} = require('taskcluster-lib-postgres');

const COMPONENT_CLASSES = [];

fs.readdirSync(`${__dirname}/`).forEach(file => {
  if (file !== 'index.js' && file.match(/\.js$/)) {
    const name = file.slice(0, -3);
    const cls = require(`./${file}`);
    COMPONENT_CLASSES.push({name, cls});
  }
});

/**
 * A FakeDatabase has working `db.fns.<name>` methods that do not actually
 * access a database, making it possible to test most of Taskcluster without a
 * DB.
 *
 * An instance of each of the component classes is available as an instance property,
 * providing access to various helpers like `db.secrets.makeSecret`.
 */
class FakeDatabase {
  constructor({schema, serviceName}) {
    const allMethods = schema.allMethods();
    this.fns = {};
    this.deprecatedFns = {};

    COMPONENT_CLASSES.forEach(({name, cls}) => {
      const instance = new cls({schema, serviceName});
      this[name] = instance;

      allMethods.forEach(({ name: methodName, mode, serviceName: fnServiceName, deprecated }) => {
        if (instance[methodName]) {
          let collection = this.fns;
          if (deprecated) {
            collection = this.deprecatedFns;
          }
          collection[methodName] = async (...args) => {
            if (serviceName !== fnServiceName && mode === WRITE) {
              throw new Error(
                `${serviceName} is not allowed to call any methods that do not belong to this service and which have mode=WRITE`,
              );
            }
            return instance[methodName].apply(instance, args);
          };
        }
      });
    });
  }

  async close() {
  }
}

module.exports = {FakeDatabase};
