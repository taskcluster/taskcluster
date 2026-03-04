import sinon from 'sinon';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';

const __dirname = new URL('.', import.meta.url).pathname;
const schemaPath = new URL('../../../../node_modules/ajv/lib/refs/json-schema-draft-06.json', import.meta.url).pathname;
const jsonSchemaDraft06 = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

/**
 * A parent class for fake cloud implementations.
 *
 * These are instantiated by a test suite, and hooked into the setup/teardown
 * with `fake.forSuite()`.
 *
 * General guidelines for fakes:
 *  - only fake what is necessary
 *  - be as strict as possible, prohibiting unknown fields, arguments, etc.
 */
export class FakeCloud {
  constructor() {
    this.sinon = sinon.createSandbox({});
  }

  /**
   * Set this fake up for the current Mocha suite
   */
  forSuite() {
    suiteSetup(() => this._patch());
    setup(() => this._reset());
    suiteTeardown(() => {
      this.sinon.restore();
      this._restore();
    });
  }

  /**
   * Patch anything necessary to get this fake used.
   */
  _patch() {
    throw new Error('Subclasses should implement this');
  }

  /**
   * Reset any faked state to its initial state
   */
  _reset() {
    throw new Error('Subclasses should implement this');
  }

  /**
   * Restore removes the mock altogether
   */
  _restore() {
    return;
  }

  /**
   * Validate the given value against the given schema in ./schemas
   */
  validate(value, schemaFile) {
    if (!this.ajv) {
      const ajv = new Ajv.default({
        useDefaults: true,
        validateFormats: true,
        verbose: true,
        validateSchema: false,
        allErrors: true,
      });

      addFormats(ajv);
      ajv.addMetaSchema(jsonSchemaDraft06);
      const dir = path.join(__dirname, 'schemas');
      fs.readdirSync(dir).forEach(file => {
        if (!file.endsWith('.yml')) {
          return;
        }
        const schema = yaml.load(fs.readFileSync(path.join(dir, file), 'utf-8'));
        schema.$id = file;
        ajv.addSchema(schema);
      });

      this.ajv = ajv;
    }

    if (this.ajv.validate(schemaFile, value)) {
      return;
    }
    for (let error of this.ajv.errors) {
      if (error.params['additionalProperty']) {
        error.message += ': ' + JSON.stringify(error.params['additionalProperty']);
      }
    }
    throw new Error([
      '\nSchema Validation Failed!',
      `\nSchema Errors (${schemaFile}):\n  * `,
      this.ajv.errorsText(this.ajv.errors, { separator: '\n  * ' }),
    ].join(''));
  }
}
