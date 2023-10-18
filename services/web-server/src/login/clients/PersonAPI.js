import assert from 'assert';
import request from 'superagent';
import Debug from 'debug';

const debug = Debug('PersonAPI');
const baseUrl = 'https://person.api.sso.mozilla.com/v2';

// A client for the PersonAPI v2 endpoints.
// https://github.com/mozilla-iam/cis/blob/master/docs/PersonAPI.md#what-routes-are-available-ie-what-queries-can-i-make
export default class PersonAPI {
  constructor({ accessToken }) {
    assert(accessToken, 'An access token is required to access PersonAPI endpoints');

    this.accessToken = accessToken;
  }

  async getProfileFromUserId(userId) {
    const { body: profile } = await request
      .get(`${baseUrl}/user/user_id/${userId}`)
      .set('Authorization', `Bearer ${this.accessToken}`);

    if (!profile) {
      debug(`profile for userId ${userId} not found`);
    }

    return profile;
  }

  async getProfileFromUUID(uuid) {
    const { body: profile } = await request
      .get(`${baseUrl}/user/uuid/${uuid}`)
      .set('Authorization', this.accessToken);

    if (!profile) {
      debug(`profile for uuid ${uuid} not found`);
    }

    return profile;
  }

  async getProfileFromPrimaryEmail(primaryEmail) {
    const { body: profile } = await request
      .get(`${baseUrl}/user/primary_email/${primaryEmail}`)
      .set('Authorization', this.accessToken);

    if (!profile) {
      debug(`profile for primary email ${primaryEmail} not found`);
    }

    return profile;
  }

  async getProfileFromPrimaryUsername(primaryUsername) {
    const { body: profile } = await request
      .get(`${baseUrl}/user/primary_username/${primaryUsername}`)
      .set('Authorization', this.accessToken);

    if (!profile) {
      debug(`profile for primary username ${primaryUsername} not found`);
    }

    return profile;
  }
}
