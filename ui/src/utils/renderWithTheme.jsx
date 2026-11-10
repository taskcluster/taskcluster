import React from 'react';
import { render } from '@testing-library/react';
import { MuiThemeProvider } from '@material-ui/core/styles';
import theme from '../theme';

function Wrapper({ children }) {
  return (
    <MuiThemeProvider theme={theme.darkTheme}>{children}</MuiThemeProvider>
  );
}

export default function renderWithTheme(ui, options) {
  return render(ui, { wrapper: Wrapper, ...options });
}
