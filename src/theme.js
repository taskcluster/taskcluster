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
    useNextVariants: true,
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
        color: 'rgba(255, 255, 255, 0.7)',
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
