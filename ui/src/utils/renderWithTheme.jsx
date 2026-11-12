import React from 'react';
import { render } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import theme from '../theme';

function Wrapper({ children }) {
  return <ThemeProvider theme={theme.darkTheme}>{children}</ThemeProvider>;
}

export default function renderWithTheme(ui, options) {
  return render(ui, { wrapper: Wrapper, ...options });
}
