const { createMuiTheme } = require('@material-ui/core/styles');
const red = require('@material-ui/core/colors/red').default;

const Roboto300 = { fontFamily: 'Roboto300, sans-serif' };
const Roboto400 = { fontFamily: 'Roboto400, sans-serif' };
const Roboto500 = { fontFamily: 'Roboto500, sans-serif' };
const error = {
  main: red[500],
  dark: red[700],
  light: red[300],
  contrastText: 'white',
};
const theme = createMuiTheme({
  palette: {
    error: {
      ...red,
      ...error,
    },
  },
  typography: {
    ...Roboto400,
    h1: Roboto300,
    h2: Roboto400,
    h3: Roboto400,
    h4: Roboto400,
    h5: Roboto400,
    h6: Roboto500,
    subtitle1: Roboto400,
    body1: Roboto500,
    body2: Roboto400,
    caption: Roboto400,
    button: Roboto500,
  },
});

module.exports = {
  ...theme,
  styleguide: {
    StyleGuide: {
      /*
        The purpose of defining class stages is to
        re-render once a stage has been met. We start
        with the minimal default stage of sans-serif,
        and progressively re-render.
      */
      '@global body': {
        fontFamily: 'sans-serif',
        fontWeight: 400,
        WebkitFontSmoothing: 'antialiased',
      },
    },
    fontFamily: {
      base: theme.typography.fontFamily,
    },
    fontSize: {
      base: theme.typography.fontSize - 1,
      text: theme.typography.fontSize,
      small: theme.typography.fontSize - 2,
    },
  },
};
