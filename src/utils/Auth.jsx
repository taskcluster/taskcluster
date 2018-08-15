import { Component, createContext } from 'react';

export const AuthContext = createContext({
  user: null,
  authorize: Function.prototype,
  unauthorize: Function.prototype,
});

export const withAuth = UnauthedComponent =>
  class AuthorizableComponent extends Component {
    render() {
      return (
        <AuthContext.Consumer>
          {({ user, authorize, unauthorize }) => (
            <UnauthedComponent
              {...this.props}
              user={user}
              onAuthorize={authorize}
              onUnauthorize={unauthorize}
            />
          )}
        </AuthContext.Consumer>
      );
    }
  };
