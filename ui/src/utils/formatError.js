export default err => {
  const error =
    (err &&
      err.networkError &&
      err.networkError.result &&
      err.networkError.result.errors[0].message) ||
    err;

  return error;
};
