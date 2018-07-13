/** Returns true if the worker type name is considered valid. */
export default workerType => /^[a-zA-Z0-9_-]{1,22}$/.test(workerType);
