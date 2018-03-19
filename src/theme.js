import { createMuiTheme } from 'material-ui/styles';
import red from 'material-ui/colors/red';

const Roboto300 = { fontFamily: 'Roboto300, sans-serif' };
const Roboto400 = { fontFamily: 'Roboto400, sans-serif' };
const Roboto500 = { fontFamily: 'Roboto500, sans-serif' };

export default createMuiTheme({
  palette: {
    type: 'dark',
    primary: {
      background: '#12202c',
      main: '#1b2a39',
    },
    secondary: {
      main: '#0e1923',
    },
    error: {
      ...red,
    },
    text: {
      primary: 'rgba(255, 255, 255, 0.9)',
      secondary: 'rgba(255, 255, 255, 0.7)',
      disabled: 'rgba(255, 255, 255, 0.5)',
      hint: 'rgba(255, 255, 255, 0.5)',
      icon: 'rgba(255, 255, 255, 0.5)',
      active: 'rgba(255, 255, 255, 0.12)',
      inactive: 'rgba(255, 255, 255, 0.3)',
    },
  },
  typography: {
    ...Roboto400,
    display4: Roboto300,
    display3: Roboto400,
    display2: Roboto400,
    display1: Roboto400,
    headline: Roboto400,
    title: Roboto500,
    subheading: Roboto400,
    body2: Roboto500,
    body1: Roboto400,
    caption: Roboto400,
    button: Roboto500,
  },
  spacing: {
    unit: 8,
    double: 16,
    triple: 24,
    quad: 32,
  },
  drawerWidth: 240,
  overrides: {
    MuiPaper: {
      root: {
        backgroundColor: '#1b2a39',
      },
    },
  },
});
