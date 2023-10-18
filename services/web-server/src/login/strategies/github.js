import assert from 'assert';
import passport from 'passport';
import { Strategy } from 'passport-github';
import taskcluster from 'taskcluster-client';
import User from '../User.js';
import login from '../../utils/login.js';
import WebServerError from '../../utils/WebServerError.js';
import tryCatch from '../../utils/tryCatch.js';
import { encode, decode } from '../../utils/codec.js';
import GithubClient from '../clients/GithubClient.js';

export default class Github {
  constructor({ name, cfg, monitor, db }) {
    const strategyCfg = cfg.login.strategies[name];

    assert(strategyCfg.clientId, `${name}.clientId is required`);
    assert(strategyCfg.clientSecret, `${name}.clientSecret is required`);

    Object.assign(this, strategyCfg);

    this.identityProviderId = 'github';
    this.monitor = monitor;
    this.db = db;
  }

  async getUser({ username, userId }) {
    const user = new User();
    const [token] = await this.db.fns.load_github_access_token(String(userId));

    if (!token) {
      this.monitor.debug('Github user id could not be found in the database.', {
        userId,
      });

      return;
    }

    const accessToken = this.db.decrypt({ value: token.encrypted_access_token }).toString('utf8');

    const githubClient = new GithubClient({ accessToken });
    const [githubErr, githubUser] = await tryCatch(githubClient.userFromUsername(username));

    // 404 means the user doesn't exist; otherwise, throw the error up the chain
    if (githubErr) {
      if (githubErr.status === 404) {
        return;
      }

      throw githubErr;
    }

    if (githubUser.id !== userId) {
      this.monitor.debug(`Github user id ${githubUser.id} does not match userId ${userId} from the identity.`);

      return;
    }

    user.identity = `${this.identityProviderId}/${userId}|${encode(username)}`;

    // take a user and attach roles to it
    await this.addRoles(username, userId, user);

    return user;
  }

  async addRoles(username, userId, user) {
    const [token] = await this.db.fns.load_github_access_token(String(userId));

    if (!token) {
      this.monitor.debug(`Github user id ${userId} could not be found in the database.`);

      return;
    }

    const accessToken = this.db.decrypt({ value: token.encrypted_access_token }).toString('utf8');

    const githubClient = new GithubClient({ accessToken });
    const [teamsErr, teams] = await tryCatch(githubClient.listTeams());

    if (teamsErr) {
      throw teamsErr;
    }

    const [userMembershipsOrgsErr, userMembershipsOrgs] = await tryCatch(githubClient.userMembershipsOrgs());

    if (userMembershipsOrgsErr) {
      throw userMembershipsOrgsErr;
    }

    const roles = [
      ...teams.map(({ slug: team, organization }) => `github-team:${organization.login}/${team}`),
      ...userMembershipsOrgs
        .filter(({ role }) => role === 'admin')
        .map(({ organization }) => `github-org-admin:${organization.login}`),
    ];

    user.addRole(...roles);
  }

  userFromIdentity(identity) {
    const [userId, username = ''] = identity.split('/')[1].split('|');

    return this.getUser({ username: decode(username), userId: Number(userId) });
  }

  useStrategy(app, cfg) {
    const { credentials } = cfg.taskcluster;
    const strategyCfg = cfg.login.strategies['github'];
    const loginMiddleware = login(cfg.app.publicUrl);

    if (!strategyCfg.clientId || !strategyCfg.clientSecret) {
      throw new Error(
        'Unable to use "github" login strategy without GitHub client ID or secret',
      );
    }

    if (!credentials || !credentials.clientId || !credentials.accessToken) {
      throw new Error(
        'Unable to use "github" login strategy without taskcluster clientId and accessToken',
      );
    }

    const callback = '/login/github/callback';

    passport.use(
      new Strategy(
        {
          clientID: strategyCfg.clientId,
          clientSecret: strategyCfg.clientSecret,
          callbackURL: `${cfg.app.publicUrl}${callback}`,
          scope: 'repo',
        },
        async (accessToken, refreshToken, profile, next) => {
          await this.db.fns.add_github_access_token(
            profile.id,
            this.db.encrypt({ value: Buffer.from(accessToken, 'utf8') }),
          );
          const [userErr, user] = await tryCatch(
            this.getUser({ username: profile.username, userId: Number(profile.id) }),
          );

          if (userErr) {
            this.monitor.reportError(userErr || 'Could not get user', {
              identityProviderId: this.identityProviderId,
              username: profile.username,
              userId: Number(profile.id),
            });
          }

          if (!user) {
            // Don't report much to the user, to avoid revealing sensitive information, although
            // it is likely in the service logs.
            return next(new WebServerError('InputError', 'Could not generate credentials for this access token'));
          }

          const exp = Math.floor(taskcluster.fromNow('30 days').getTime() / 1000);

          return next(null, {
            profile,
            providerExpires: new Date(exp * 1000),
            identityProviderId: 'github',
            identity: user.identity,
          });
        },
      ),
    );
    app.get('/login/github', passport.authenticate('github'));
    app.get(
      callback,
      passport.authenticate('github'),
      loginMiddleware,
    );
  }
}
