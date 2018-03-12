import { createMuiTheme } from 'material-ui/styles';
import grey from 'material-ui/colors/grey';
import cyan from 'material-ui/colors/cyan';
import red from 'material-ui/colors/red';

const Roboto300 = { fontFamily: 'Roboto300, sans-serif' };
const Roboto400 = { fontFamily: 'Roboto400, sans-serif' };
const Roboto500 = { fontFamily: 'Roboto500, sans-serif' };

export default createMuiTheme({
  palette: {
    type: 'dark',
    primary: {
      ...grey
    },
    secondary: {
      main: cyan[900]
    },
    error: {
      ...red
    },
    text: {
      active: 'rgba(255, 255, 255, 0.12)'
    }
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
    button: Roboto500
  },
  spacing: {
    unit: 8,
    double: 16,
    triple: 24,
    quad: 32
  },
  drawerWidth: 240
});
