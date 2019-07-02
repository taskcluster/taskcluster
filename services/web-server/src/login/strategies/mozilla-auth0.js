const assert = require('assert');
const Debug = require('debug');
const request = require('superagent');
const passport = require('passport');
const Auth0Strategy = require('passport-auth0');
const User = require('../User');
const PersonAPI = require('../clients/PersonAPI');
const WebServerError = require('../../utils/WebServerError');
const { encode, decode } = require('../../utils/codec');
const identityFromClientId = require('../../utils/identityFromClientId');
const tryCatch = require('../../utils/tryCatch');
const login = require('../../utils/login');
const verifyJwtAuth0 = require('../../utils/verifyJwtAuth0');
const jwt = require('../../utils/jwt');

const debug = Debug('strategies.mozilla-auth0');

module.exports = class MozillaAuth0 {
  constructor({ name, cfg }) {
    const strategyCfg = cfg.login.strategies[name];

    assert(strategyCfg.domain, `${name}.domain is required`);
    assert(strategyCfg.clientId, `${name}.clientId is required`);
    assert(strategyCfg.clientSecret, `${name}.clientSecret is required`);

    Object.assign(this, strategyCfg);

    this.jwt = cfg.login.jwt;
    this.rootUrl = cfg.taskcluster.rootUrl;
    this._personApi = null;
    this._personApiExp = null;
    this.identityProviderId = 'mozilla-auth0';
  }

  // Get a personAPI instance, by requesting an API token as needed.
  // See https://github.com/mozilla-iam/cis/blob/f90ba5033785fd4fb14faf9f066e17356babb5aa/docs/PersonAPI.md#do-you-have-code-examples
  async getPersonApi() {
    if (this._personApi && new Date().getTime() / 1000 < this._personApiExp - 10) {
      return this._personApi;
    }

    const res = await request.post(`https://${this.domain}/oauth/token`)
      .set('content-type', 'application/json')
      .send({
        audience: 'api.sso.mozilla.com',
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
      });
    const {
      access_token: accessToken,
      expires_in: expiresIn,
    } = JSON.parse(res.text);
    const expires = new Date().getTime() + (expiresIn * 1000);

    if (!accessToken) {
      throw new Error('did not receive a token from Auth0 /oauth/token endpoint');
    }

    // Create a new
    this._personApi = new PersonAPI({ accessToken });
    this._personApiExp = expires;

    return this._personApi;
  }

  async getUser({ userId }) {
    const personApi = await this.getPersonApi();
    const userProfile = await personApi.getProfileFromUserId(userId);
    const user = new User();

    if (!userProfile || !userProfile.user_id) {
      return;
    }

    if ('active' in userProfile && !userProfile.active) {
      debug('user is not active; rejecting');
      return;
    }

    user.identity = this.identityFromProfile(userProfile);

    if (!user.identity) {
      debug('No recognized identity providers');
      return;
    }

    // take a user and attach roles to it
    this.addRoles(userProfile, user);

    return user;
  }

  userFromIdentity(identity) {
    let encodedUserId = identity.split('/')[1];

    if (encodedUserId.startsWith('github|') || encodedUserId.startsWith('oauth2|firefoxaccounts|')) {
      encodedUserId = encodedUserId.replace(/\|[^|]*$/, '');
    }

    const userId = decode(encodedUserId);
    return this.getUser({ userId });
  }

  async expFromIdToken(idToken) {
    const [jwtError, profile] = await tryCatch(
      verifyJwtAuth0({ token: idToken, domain: this.domain, audience: this.clientId })
    );

    if (jwtError) {
      debug(`error validating the idToken jwt: ${jwtError}`);
      return;
    }

    return profile.exp;
  }

  userFromClientId(clientId) {
    const identity = identityFromClientId(clientId);

    if (!identity) {
      return;
    }

    return this.userFromIdentity(identity);
  }

  identityFromProfile(profile) {
    const userId = profile.user_id.value;
    let identity = `${this.identityProviderId}/${encode(userId)}`;

    // if the identity is a github or firefox-accounts identity, then we want
    // to add the username after a `|` character, to disambiguate the
    // otherwise-numeric usernames
    if (userId.startsWith('github|')) {
      for (let {provider, connection, user_id: github_user_id} of profile.identities) {
        if (provider === 'github' && connection === 'github') {
          // we expect the auth0 user_id to be `github|<githubUserId>`
          assert(userId.endsWith(github_user_id.toString()),
            `Auth0 user_id ${userId} not formatted as expected (expected |${github_user_id})`);
          identity += `|${profile.nickname}`;
          break;
        }
      }
    } else if (userId.startsWith('oauth2|firefoxaccounts|')) {
      for (let {provider, connection, profileData} of profile.identities) {
        if (provider === 'oauth2' && connection === 'firefoxaccounts') {
          // we expect the auth0 user_id to be `oauth|firefoxaccounts|<fxa_sub>`
          // sometimes fxa_sub is on profileData, sometimes on the profile
          const fxa_sub = profileData ? profileData.fxa_sub : profile.fxa_sub;
          assert(userId.endsWith(fxa_sub),
            `Auth0 user_id ${userId} not formatted as expected`);
          const email = profileData ? profileData.email : profile.email;
          identity += `|${email}`;
          break;
        }
      }
    }

    return identity;
  }

  addRoles(profile, user) {
    const accessInformation = profile.access_information;
    const { ldap, mozilliansorg, hris } = accessInformation;

    // Non-prefixed groups are what is known as Mozilla LDAP groups. Groups prefixed by a provider
    // name and underscore are provided by a specific group engine. For example,
    // `providername_groupone` is provided by `providername`. Per https://goo.gl/bwWjvE.
    // For our own purposes, if the prefix is not mozilliansorg. then we treat it as an ldap group
    const groups = [
      ...(ldap && ldap.values ? Object.keys(ldap.values).map(group => `mozilla-group:${group}`) : []),
      ...(hris && hris.values ? Object.keys(hris.values).map(group => `hris_${group}`) : []),
      ...(mozilliansorg && mozilliansorg.values ? Object.keys(mozilliansorg.values).map(group => `mozilliansorg_${group}`) : []),
    ];

    user.addRole(...groups);
  }

  useStrategy(app, cfg) {
    const { credentials } = cfg.taskcluster;
    const strategyCfg = cfg.login.strategies['mozilla-auth0'];
    const loginMiddleware = login(cfg.app.publicUrl);

    if (!credentials || !credentials.clientId || !credentials.accessToken) {
      throw new Error(
        'Unable to use "mozilla-auth0" login strategy without taskcluster clientId and accessToken'
      );
    }

    const callback = '/login/mozilla-auth0/callback';

    passport.use(
      new Auth0Strategy(
        {
          domain: strategyCfg.domain,
          clientID: strategyCfg.clientId,
          clientSecret: strategyCfg.clientSecret,
          scope: 'openid profile',
          callbackURL: `${cfg.app.publicUrl}${callback}`,
          // The state parameter requires session support to be enabled.
          // We can't use cookies until we implement CORS and revisit the RRA.
          state: false,
        },
        // accessToken is the token to call Auth0 API (not needed in most cases)
        // extraParams.id_token has the JSON Web Token
        // profile has all the information from the user
        async (accessToken, refreshToken, extraParams, profile, done) => {
          const user = await this.getUser({ userId: profile.user_id });

          if (!user) {
            // Don't report much to the user, to avoid revealing sensitive information, although
            // it is likely in the service logs.
            done(new WebServerError('InputError', 'Could not generate credentials for this access token'));
          }

          const { token: taskclusterToken, expires: providerExpires } = jwt.generate({
            rootUrl: this.rootUrl,
            key: this.jwt.key,
            sub: user.identity,
            exp: await this.expFromIdToken(extraParams.id_token),
          });

          done(null, {
            profile,
            taskclusterToken,
            providerExpires,
            identityProviderId: 'mozilla-auth0',
          });
        }
      )
    );

    // Called by the consumer
    app.get('/login/mozilla-auth0', passport.authenticate('auth0'));
    // Called by the provider
    app.get(
      callback,
      passport.authenticate('auth0', { session: false }),
      loginMiddleware
    );
  }
};
