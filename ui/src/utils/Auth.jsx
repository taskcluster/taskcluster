import React, { Component, createContext } from 'react';

export const AuthContext = createContext({
  user: null,
  authReady: false,
  authorize: Function.prototype,
  unauthorize: Function.prototype,
});

export const withAuth = UnauthedComponent =>
  class AuthorizableComponent extends Component {
    render() {
      return (
        <AuthContext.Consumer>
          {({ user, authReady, authorize, unauthorize }) => (
            <UnauthedComponent
              {...this.props}
              user={user}
              authReady={authReady}
              onAuthorize={authorize}
              onUnauthorize={unauthorize}
            />
          )}
        </AuthContext.Consumer>
      );
    }
  };
