const { isPlainObject } = require('lodash');
const assert = require('assert').strict;

/**
 * Representation for a set of relations in the schema -- things with rows and
 * typed columns, like tables ore views.
 */
class Relations {
  /**
   * Load relations from a file
   */
  static fromYamlFileContent(content, filename) {
    Relations._check(content, filename);
    const relations = new Relations(content);
    return relations;
  }

  /**
   * Load relations from a serialized representation
   */
  static fromSerializable(serializable) {
    Relations._check(serializable, 'serializable input');
    const relations = new Relations(serializable);
    return relations;
  }

  /**
   * Create a serialized representation
   */
  asSerializable() {
    return this.relations;
  }

  constructor(relations) {
    this.relations = relations;
  }

  /**
   * Get the contents in pretty much the form they appear in the file
   */
  get() {
    return this.relations;
  }

  static _check(content, filename) {
    assert(isPlainObject(content), `${filename} should define an object`);
    Object.keys(content).forEach(tableName => {
      const columns = content[tableName];
      assert(isPlainObject(columns), `each table in ${filename} should define an object`);
      for (const [name, type] of Object.entries(columns)) {
        assert(typeof type === 'string', `${filename}: type of ${tableName}.${name} should be a string`);
      }
    });
  }
}

module.exports = Relations;
