import React, { Component } from 'react';
import { Auth } from '@taskcluster/client-web';
import { satisfiesExpression } from 'taskcluster-lib-scopes';

const TTL = 5 * 60 * 1000;
let cache = null;

const fetchAnonymousScopes = async rootUrl => {
  try {
    // no credentials, so this returns the scopes of the anonymous role
    const auth = new Auth({ rootUrl });
    const { scopes } = await auth.currentScopes();

    return scopes;
  } catch {
    return null;
  }
};

/**
 * Get the expanded scopes of the anonymous role, cached in memory for a few
 * minutes.  Resolves to null if they could not be fetched.
 */
export const getAnonymousScopes = () => {
  const rootUrl = window.env.TASKCLUSTER_ROOT_URL;

  if (cache?.rootUrl === rootUrl && Date.now() - cache.fetchedAt < TTL) {
    return cache.promise;
  }

  const promise = fetchAnonymousScopes(rootUrl);

  cache = { rootUrl, fetchedAt: Date.now(), promise };

  return promise;
};

export const invalidateAnonymousScopes = () => {
  cache = null;
};

/**
 * True if the anonymous role can read the named artifact, in which case its
 * URL does not need to be signed.
 */
export const isPublicArtifact = (anonymousScopes, name) =>
  Boolean(anonymousScopes) &&
  satisfiesExpression(anonymousScopes, `queue:get-artifact:${name}`);

/**
 * Provide `anonymousScopes` (null until loaded, or if they could not be
 * fetched) and `anonymousScopesLoaded` props.
 */
export const withAnonymousScopes = WrappedComponent =>
  class AnonymousScopesComponent extends Component {
    state = {
      anonymousScopes: null,
      anonymousScopesLoaded: false,
    };

    componentDidMount() {
      this.mounted = true;
      this.loadAnonymousScopes();
    }

    componentWillUnmount() {
      this.mounted = false;
    }

    loadAnonymousScopes = async () => {
      const anonymousScopes = await getAnonymousScopes();

      if (this.mounted) {
        this.setState({ anonymousScopes, anonymousScopesLoaded: true });
      }
    };

    render() {
      return (
        <WrappedComponent
          {...this.props}
          anonymousScopes={this.state.anonymousScopes}
          anonymousScopesLoaded={this.state.anonymousScopesLoaded}
        />
      );
    }
  };
