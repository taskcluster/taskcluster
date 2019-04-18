/**
 * Given a user profile, return a picture if any.
 */
export default user => {
  if (!user) {
    return null;
  }

  switch (user.identityProviderId) {
    // A profile returned from mozilla auth0
    case 'mozilla-auth0': {
      return user.profile.picture;
    }

    // http://www.passportjs.org/docs/profile/
    case 'github-oauth2': {
      return user.profile.photos && user.profile.photos.length
        ? user.profile.photos[0].value
        : null;
    }

    default: {
      return null;
    }
  }
};
