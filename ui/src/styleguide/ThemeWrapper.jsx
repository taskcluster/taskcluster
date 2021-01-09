import React, { Component } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import ErrorPanel from '@mozilla-frontend-infra/components/ErrorPanel';
import { MuiThemeProvider } from '@material-ui/core/styles';
import theme from '../theme';

export default class ThemeWrapper extends Component {
  render() {
    return (
      <MuiThemeProvider theme={theme.darkTheme}>
        <ErrorBoundary FallbackComponent={ErrorPanel}>
          {this.props.children}
        </ErrorBoundary>
      </MuiThemeProvider>
    );
  }
}
