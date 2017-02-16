let assume = require('assume');

let notify = {
  credentials: 'test-credentials',
  authorizedScopes: ['test:scope'],
  email: payload => {
    assume(payload.address).exists();
    assume(payload.subject).exists();
    assume(payload.content).exists();
    notify.lastEmail = payload;
  },
};

module.exports = notify;
