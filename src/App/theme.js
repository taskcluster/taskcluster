import { createMuiTheme } from 'material-ui/styles';

// https://material.io/color/#!/?view.left=0&view.right=0&primary.color=006064&secondary.color=455A64
export default createMuiTheme({
  palette: {
    primary: {
      light: '#428d90',
      main: '#005f63',
      dark: '#003539'
    },
    secondary: {
      light: '#718792',
      main: '#455a64',
      dark: '#1c313a'
    },
    text: {
      primary: '#ffffff',
      secondary: '#ffffff',
      black: '#000000'
    }
  }
});
