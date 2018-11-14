import React, { Component } from 'react';
import { MuiThemeProvider } from '@material-ui/core/styles';
import ErrorPanel from '../components/ErrorPanel';
import theme from '../theme';

export default class ThemeWrapper extends Component {
  state = {
    error: null,
  };

  componentDidCatch(error) {
    this.setState({ error });
  }

  render() {
    return (
      <MuiThemeProvider theme={theme}>
        {this.state.error ? (
          <ErrorPanel error={this.state.error} />
        ) : (
          this.props.children
        )}
      </MuiThemeProvider>
    );
  }
}
