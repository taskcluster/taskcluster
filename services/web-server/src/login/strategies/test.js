const User = require('../User');
const taskcluster = require('taskcluster-client');
const { encode, decode } = require('../../utils/codec');

module.exports = class Test {
  constructor() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('do not use test strategy in production');
    }
    this.identityProviderId = 'test';
    this.userRoles = new Map();
  }

  fakeUserRoles(userId, roles) {
    this.userRoles.set(userId, roles);
  }

  async getUser({ userId }) {
    const user = new User();
    user.identity = `${this.identityProviderId}/${encode(userId)}`;
    user.addRole([...this.userRoles.get(userId) || []]);
    return user;
  }

  userFromIdentity(identity) {
    const encodedUserId = identity.split('/')[1];
    const userId = decode(encodedUserId);

    return this.getUser({ userId });
  }

  useStrategy(app, cfg) {
    // unconditionally log in the user 'test'
    app.get('/login/test', (req, res, next) => {
      const user = {
        accessToken: 'THIS-SHOULD-NOT-BE-USER-VISIBLE',
        profile: {},
        providerExpires: taskcluster.fromNow('1 hour'),
        identityProviderId: 'test',
        identity: 'test/test',
      };
      req.login(user, err => {
        if (err) {
          return next(err);
        }
        res.status(204).end();
      });
    });
  }
};
