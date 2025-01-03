import lodash from 'lodash';
import { strict as assert } from 'assert';

const { isPlainObject } = lodash;

/**
 * @typedef {{[tableName: string]: {[columnName: string]: string}}} RelationsDefinition
 */

/**
 * Representation for a set of relations in the schema -- things with rows and
 * typed columns, like tables ore views.
 */
class Relations {
  /**
   * Load relations from a file
   *
   * @param {RelationsDefinition} content
   * @param {string} filename
   */
  static fromYamlFileContent(content, filename) {
    Relations._check(content, filename);
    const relations = new Relations(content);
    return relations;
  }

  /**
   * Load relations from a serialized representation
   *
   * @param {RelationsDefinition} serializable
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

  /** @param {RelationsDefinition} relations */
  constructor(relations) {
    this.relations = relations;
  }

  /**
   * Get the contents in pretty much the form they appear in the file
   */
  get() {
    return this.relations;
  }

  /**
   * @param {RelationsDefinition} content
   * @param {string} filename
   * @private
   */
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

export default Relations;
