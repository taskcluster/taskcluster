import Mozillians from 'mozillians-client'
import assert from 'assert'
var debug = require('debug')('MozilliansAuthorizer');

/* Determine appropriate roles based on Mozillians vouched groups */
class MozilliansAuthorizer {
  constructor(options) {
    assert(options, 'options are required');
    assert(options.cfg, 'options.cfg is required');
    assert(options.cfg.mozillians, 'options.cfg.mozillians is required');
    assert(options.cfg.mozillians.apiKey, 'options.cfg.mozillians.apiKey is required');
    assert(options.cfg.mozillians.allowedGroups,
        'options.cfg.mozillians.allowedGroups is required');

    this.mozillians = new Mozillians(options.cfg.mozillians.apiKey);
    this.allowedGroups = options.cfg.mozillians.allowedGroups;
  }

  async setup() {
  }

  async authorize(user) {
    // only trust persona- and sso-authenticated identities
    if (user.identityProviderId !== "sso" && user.identityProviderId !== "persona") {
      return;
    }
    let email = user.identityId;

    debug(`mozilians authorizing ${user.identity}`);

    // Find the user
    let userLookup = await this.mozillians.users({email});
    let mozilliansUser, vouched;
    if (userLookup.results.length === 1) {
      let u = userLookup.results[0];
      vouched = u.is_vouched;
      mozilliansUser = u.username;
    } else {
      // If there is no associated mozillians user at all, do nothing.
      return;
    }

    user.addRole('mozillians-user:' + mozilliansUser);

    // unvouched users just get the "mozillians-unvouched" role, and no
    // group-based roles.  This allows them to complete the tutorial.
    if (!vouched) {
      user.addRole('mozillians-unvouched');
      return
    }

    // For each group to be considered we check if the user is a member
    let groupLookups = await Promise.all(
      this.allowedGroups.map(group => {
        return this.mozillians.users({email, group}).then(result => {
          result.group = group;
          return result;
        });
      })
    );
    groupLookups.forEach(g => {
      if (g.results.length === 1) {
        let u = g.results[0];
        if (u.is_vouched && u.username === mozilliansUser) {
          debug(`found mozillians group ${g.group} for ${mozilliansUser}`);
          user.addRole('mozillians-group:' + g.group);
        }
      }
    });
  }
};

module.exports = MozilliansAuthorizer;
