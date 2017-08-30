export const async = f => async () => {
  try {
    return await f();
  } catch (err) {
    throw err;
  }
};
