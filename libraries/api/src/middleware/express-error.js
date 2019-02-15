const uuid = require('uuid');
const debug = require('debug')('api:errors');
const ErrorReply = require('../error-reply');

exports.isProduction = process.env.NODE_ENV === 'production';

/**
 * Create parameter validation middle-ware instance, given a mapping from
 * parameter to regular expression or function that returns a message as string
 * if the parameter is invalid.
 *
 * Parameters not listed in `req.params` will be ignored. But parameters
 * present must match the pattern given in `options` or the request will be
 * rejected with a 400 error message.
 */
const expressError = ({errorCodes, entry, monitor}) => {
  const {name: method, cleanPayload} = entry;
  return (err, req, res, next) => {

    if (!(err instanceof ErrorReply)) {
      const incidentId = uuid.v4();

      // report the actual error..
      debug(
        'Error occurred handling: %s, err: %s, as JSON: %j, incidentId: %s',
        req.url, err, err, incidentId, err.stack
      );
      err.incidentId = incidentId;
      err.method = method;
      err.params = req.params;
      let payload = req.body;
      if (cleanPayload) {
        payload = cleanPayload(payload);
      }
      err.payload = req.payload;
      monitor.reportError(err, {method});

      // then formulate a generic error to send to the HTTP client
      const details = {incidentId};
      if (!exports.isProduction) {
        if (err.stack) {
          details.error = err.stack.toString();
        } else {
          details.error = err.toString();
        }
      }
      const message = 'Internal Server Error, incidentId {{incidentId}}.' +
        (exports.isProduction ?
          '' :
          ' Error (not shown in production):\n```\n{{error}}\n```');

      err = new ErrorReply({code: 'InternalServerError', message, details});
    }

    let code = err.code;
    let details = err.details;
    let message = err.message;

    let status = errorCodes[code];
    let payload = req.body;
    if (cleanPayload) {
      payload = cleanPayload(payload);
    }

    if (status === undefined || typeof message !== 'string') {
      const newMessage = 'Internal error, unknown error code: ' + code + '\n' +
        (message || 'Missing message!');
      code = 'InternalServerError';
      status = 500;
      const err = new Error(newMessage);
      err.badMessage = message;
      err.badCode = code;
      err.details = details;
      monitor.reportError(err);
      message = newMessage;
    }

    const requestInfo = {
      method,
      params: req.params,
      payload,
      time: (new Date()).toJSON(),
    };

    message = message.replace(/{{([a-zA-Z0-9_-]+)}}/g, (text, key) => {
      let value = details.hasOwnProperty(key) ? details[key] : text;
      if (typeof value !== 'string') {
        value = JSON.stringify(value, null, 2);
      }
      return value;
    }) + [
      '\n\n---\n',
      '* method:     ' + method,
      '* errorCode:  ' + code,
      '* statusCode: ' + status,
      '* time:       ' + requestInfo.time,
    ].join('\n');

    return res.status(errorCodes[code]).json({code, message, requestInfo});
  };
};

exports.expressError = expressError;
