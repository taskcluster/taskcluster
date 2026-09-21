import React, { Component, createContext } from 'react';

export const AuthContext = createContext({
  user: null,
  getCredentials: null,
  authorize: Function.prototype,
  unauthorize: Function.prototype,
});

export const withAuth = UnauthedComponent =>
  class AuthorizableComponent extends Component {
    render() {
      return (
        <AuthContext.Consumer>
          {({ user, getCredentials, authorize, unauthorize }) => (
            <UnauthedComponent
              {...this.props}
              user={user}
              getCredentials={getCredentials}
              onAuthorize={authorize}
              onUnauthorize={unauthorize}
            />
          )}
        </AuthContext.Consumer>
      );
    }
  };
