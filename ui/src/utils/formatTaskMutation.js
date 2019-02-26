import upperSnakeCase from './upperSnakeCase';

// This should be called just before sending a request to the
// server when mutating a task payload.
// The GraphQL server requires that enums are capitalized.
export default payload => {
  const task = { ...payload };

  if ('priority' in payload) {
    task.priority = upperSnakeCase(payload.priority);
  }

  if ('requires' in payload) {
    task.requires = upperSnakeCase(payload.requires);
  }

  return task;
};
