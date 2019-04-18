module.exports = class WebServerError extends Error {
  constructor(name, message) {
    super();
    this.name = name;
    this.message = message;
    this.stack = (new Error()).stack;
  }
};
