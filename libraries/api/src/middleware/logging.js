/**
 * Log an API request on completion, including information determined
 * by the `remoteAuthentication` middleware, if present.
 */
const logRequest = ({builder, entry, monitor}) => {
  return (req, res, next) => {
    let sent = false;
    const start = process.hrtime();
    const send = async () => {
      // Avoid sending twice
      if (sent) {
        return;
      }
      sent = true;

      const d = process.hrtime(start);

      monitor.log.apiMethod({
        name: entry.name,
        apiVersion: builder.apiVersion,
        public: req.public,
        hasAuthed: req.hasAuthed,
        resource: req.originalUrl,
        method: req.method,
        clientId: req.hasAuthed ? await req.clientId() : '',
        expires: req.hasAuthed ? await req.expires() : '',
        sourceIp: req.ip,
        satisfyingScopes: req.satisfyingScopes ? req.satisfyingScopes : [],
        statusCode: res.statusCode,
        duration: d[0] * 1000 + d[1] / 1000000,
      });
    };
    res.once('finish', send);
    res.once('close', send);
    next();
  };
};

exports.logRequest = logRequest;
