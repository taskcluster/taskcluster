const sinon = require('sinon');
const Ajv = require('ajv');
const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');

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
class FakeCloud {
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
   * Validate the given value against the given schema in ./schemas
   */
  validate(value, schemaFile) {
    if (!this.ajv) {
      const ajv = Ajv({
        useDefaults: true,
        format: 'full',
        verbose: true,
        validateSchema: false,
        allErrors: true,
      });
      ajv.addMetaSchema(require('ajv/lib/refs/json-schema-draft-06.json'));

      const dir = path.join(__dirname, 'schemas');
      fs.readdirSync(dir).forEach(file => {
        if (!file.endsWith('.yml')) {
          return;
        }
        const schema = yaml.safeLoad(fs.readFileSync(path.join(dir, file), 'utf-8'));
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
      this.ajv.errorsText(this.ajv.errors, {separator: '\n  * '}),
    ].join(''));
  }
}

exports.FakeCloud = FakeCloud;
