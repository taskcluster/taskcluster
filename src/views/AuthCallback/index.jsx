import { hot } from 'react-hot-loader';
import { Component } from 'react';
import { Callback } from 'react-auth0-components';

@hot(module)
export default class AuthCallback extends Component {
  render() {
    return <Callback />;
  }
}
