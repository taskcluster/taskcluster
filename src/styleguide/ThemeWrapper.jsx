import { Component } from 'react';
import ErrorPanel from '@mozilla-frontend-infra/components/ErrorPanel';
import { MuiThemeProvider } from '@material-ui/core/styles';
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
      <MuiThemeProvider theme={theme.darkTheme}>
        {this.state.error ? (
          <ErrorPanel error={this.state.error} />
        ) : (
          this.props.children
        )}
      </MuiThemeProvider>
    );
  }
}
