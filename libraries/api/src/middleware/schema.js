const _ = require('lodash');
const url = require('url');
const libUrls = require('taskcluster-lib-urls');
const typeis = require('type-is');
const Debug = require('debug');

const debug = Debug('api:schema');

/**
 * Declare {input, output} schemas as options to validate
 *
 * entry:
 * {
 *   input:    'v1/input-schema.json',   // optional, null if no input, relative to service schemas
 *   output:   'v1/output-schema.json',  // optional, null if no output, relative to service schemas
 *   skipInputValidation:    true,       // defaults to false
 *   skipOutputValidation:   true,       // defaults to false
 *   name:     '...',                    // method name for debug
 * }
 *
 * This validates body against the schema given in `entry.input` and returns
 * and a 400 error messages to request if there is a schema mismatch.
 * Handlers below this should output the reply JSON structure with `req.reply`.
 * this will validate it against `outputSchema` if provided.
 * Handlers may output errors using `req.json`, as `req.reply` will validate
 * against schema and always returns a 200 OK reply.
 */
const validateSchemas = ({validator, absoluteSchemas, rootUrl, serviceName, entry}) => {
  // convert relative schema references to id's
  const input = entry.input && !entry.skipInputValidation &&
    url.resolve(libUrls.schema(rootUrl, serviceName, ''), entry.input);
  const output = entry.output && entry.output !== 'blob' && !entry.skipOutputValidation &&
    url.resolve(libUrls.schema(rootUrl, serviceName, ''), entry.output);

  // double-check that the schema exists
  if (input && !_.find(absoluteSchemas, {$id: input})) {
    throw new Error(`No schema with id ${input} for input to API method ${entry.name}`);
  }

  if (output && output != 'blob' && !_.find(absoluteSchemas, {$id: output})) {
    throw new Error(`No schema with id ${output} for output from API method ${entry.name}`);
  }

  return (req, res, next) => {
    // If input schema is defined we need to validate the input
    if (input) {
      if (!typeis(req, 'application/json')) {
        return res.reportError(
          'MalformedPayload',
          'Payload must be JSON with content-type: application/json ' +
          'got content-type: {{contentType}}', {
            contentType: req.headers['content-type'] || null,
          });
      }
      const error = validator(req.body, input);
      if (error) {
        debug('Input schema validation error: ' + error);
        return res.reportError(
          'InputValidationError',
          error,
          {schema: libUrls.schema(rootUrl, serviceName, input)});
      }
    }
    // Add a reply method sending JSON replies, this will always reply with HTTP
    // code 200... errors should be sent with res.json(code, json)
    res.reply = (json) => {
      if (!req.hasAuthed) {
        const err = new Error('Deferred auth was never checked!');
        return res.reportInternalError(err);
      }
      // If we're supposed to validate outgoing messages and output schema is
      // defined, then we have to validate against it...
      if (output) {
        const error = validator(json, output);
        if (error) {
          debug('Output schema validation error: ' + error);
          const err = new Error('Output schema validation error: ' + error);
          err.schema = libUrls.schema(rootUrl, serviceName, output);
          err.url = req.url;
          err.payload = json;
          return res.reportInternalError(err);
        }
      }
      // Allow res.reply to support 204 with empty body
      if (!json) {
        return res.status(204).send();
      }
      // If JSON was valid or validation was skipped then reply with 200 OK
      res.status(200).json(json);
    };

    // Call next piece of middleware, typically the handler...
    next();
  };
};

exports.validateSchemas = validateSchemas;
