import { formatError } from 'graphql';

export default error => {
  const data = formatError(error);

  if (
    error.originalError &&
    error.originalError.result &&
    error.originalError.result.errors &&
    error.originalError.result.errors.length === 1
  ) {
    const [originalError] = error.originalError.result.errors;

    if (originalError.message === error.message) {
      if (originalError.code) {
        data.code = originalError.code;
      }

      if (originalError.requestId) {
        data.requestId = originalError.requestId;
      }
    }
  } else if (error.originalError && error.originalError.body) {
    if (error.originalError.message) {
      [data.message] = error.message.split('---');
    }

    data.code = error.originalError.body.code;
    data.requestInfo = error.originalError.body.requestInfo;
    data.statusCode = error.originalError.statusCode;
  }

  return data;
};
