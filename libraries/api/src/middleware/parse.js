const bodyParser = require('body-parser');

/**
 * Use body-parser to parse JSON requests and also store the text of the
 * response at req.text.
 */

const parseBody = ({inputLimit}) => {
  const wrapped = bodyParser.text({
    limit:          inputLimit,
    type:           'application/json',
  });
  return (req, res, next) => {
    wrapped(req, res, () => {
      // Use JSON middleware, and add hack to store text as req.text
      if (typeof req.body === 'string' && req.body !== '') {
        req.text = req.body;
        try {
          req.body = JSON.parse(req.text);
          if (!(req.body instanceof Object)) {
            throw new Error('Must be an object or array');
          }
        } catch (err) {
          return res.reportError(
            'MalformedPayload', 'Failed to parse JSON: {{errMsg}}', {
              errMsg: err.message,
            });
        }
      } else {
        req.text = '';
        req.body = {};
      }
      next();
    });
  };
};

exports.parseBody = parseBody;
