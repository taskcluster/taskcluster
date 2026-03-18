export default err => {
  const error =
    (err?.networkError?.result?.errors[0].message) ||
    err;

  return error;
};
