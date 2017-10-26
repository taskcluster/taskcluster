module.exports = {
  validatePayload(validator, payload, status, schema) {
    let payloadErrors = [];

    let err = validator(payload, schema);
    if (err) { payloadErrors.push(err); }

    if (!payload.artifacts) {
      return payloadErrors;
    }

    let taskExpiration = new Date(status.expires);

    Object.keys(payload.artifacts).forEach((name) => {
      let artifact = payload.artifacts[name];

      if (!artifact.expires) {
        return;
      }

      let artifactExpiration = new Date(artifact.expires);
      if (artifactExpiration.getTime() > taskExpiration.getTime()) {
        let message = `Artifact expiration for '${name}' must not be greater ` +
                      `than task expiration. Artifact expiration is ` +
                      `'${artifactExpiration}' but task expiration is '${taskExpiration}'`;
        payloadErrors.push(message);
      }
    });

    return payloadErrors;
  }
}
