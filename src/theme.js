import { createMuiTheme } from '@material-ui/core/styles';
import { fade, lighten } from '@material-ui/core/styles/colorManipulator';
import transitions from '@material-ui/core/styles/transitions';
import red from '@material-ui/core/colors/red';
import amber from '@material-ui/core/colors/amber';
import blue from '@material-ui/core/colors/blue';
import green from '@material-ui/core/colors/green';
import { THEME } from './utils/constants';

const Roboto300 = { fontFamily: 'Roboto300, sans-serif' };
const Roboto400 = { fontFamily: 'Roboto400, sans-serif' };
const Roboto500 = { fontFamily: 'Roboto500, sans-serif' };
const success = {
  main: green[500],
  dark: green[700],
};
const warning = {
  main: amber[500],
  dark: amber[700],
  light: amber[200],
  contrastText: 'rgba(0, 0, 0, 0.87)',
};
const error = {
  main: red[500],
  dark: red[700],
  light: red[300],
};
const createTheme = isDarkTheme => ({
  palette: {
    type: isDarkTheme ? 'dark' : 'light',
    background: {
      default: isDarkTheme ? THEME.DARK_THEME_BACKGROUND : '#fff',
    },
    primary: {
      main: isDarkTheme ? THEME.PRIMARY_DARK : THEME.PRIMARY_LIGHT,
    },
    secondary: {
      main: THEME.SECONDARY,
    },
    error: {
      ...red,
      ...error,
    },
    success: {
      ...green,
      ...success,
    },
    warning: {
      ...amber,
      ...warning,
    },
    info: {
      ...blue,
    },
    text: {
      primary: isDarkTheme ? THEME.PRIMARY_TEXT_DARK : THEME.PRIMARY_TEXT_LIGHT,
      secondary: isDarkTheme
        ? 'rgba(255, 255, 255, 0.7)'
        : 'rgba(0, 0, 0, 0.7)',
      disabled: isDarkTheme ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)',
      hint: isDarkTheme ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)',
      icon: isDarkTheme ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)',
      active: isDarkTheme ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.9)',
      inactive: isDarkTheme ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.4)',
    },
  },
  typography: {
    useNextVariants: true,
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
  spacing: {
    unit: 8,
    double: 16,
    triple: 24,
    quad: 32,
  },
  drawerWidth: THEME.DRAWER_WIDTH,
  docsDrawerWidth: THEME.DRAWER_WIDTH + 125,
  mixins: {
    highlight: {
      fontFamily: 'Consolas, Monaco, Andale Mono, Ubuntu Mono, monospace',
      backgroundColor: isDarkTheme
        ? THEME.TEN_PERCENT_WHITE
        : THEME.TEN_PERCENT_BLACK,
      border: `1px solid ${
        isDarkTheme ? THEME.TEN_PERCENT_WHITE : THEME.TEN_PERCENT_BLACK
      }`,
      borderRadius: 2,
      paddingLeft: 4,
      paddingRight: 4,
    },
    warningPanel: {
      '& code': {
        color: lighten('#fff', 0.2),
      },
    },
    listItemButton: {
      '& svg': {
        transition: transitions.create('fill'),
        fill: lighten(
          isDarkTheme ? THEME.PRIMARY_TEXT_LIGHT : THEME.PRIMARY_TEXT_LIGHT,
          0.4
        ),
      },
      '&:hover svg': {
        fill: isDarkTheme ? THEME.PRIMARY_TEXT_DARK : THEME.PRIMARY_TEXT_LIGHT,
      },
    },
    hover: {
      '&:hover': {
        textDecoration: 'none',
        backgroundColor: fade(
          isDarkTheme ? THEME.PRIMARY_TEXT_DARK : THEME.PRIMARY_TEXT_LIGHT,
          0.08
        ),
        // Reset on touch devices, it doesn't add specificity
        '@media (hover: none)': {
          backgroundColor: 'transparent',
        },
        '&$disabled': {
          backgroundColor: 'transparent',
        },
      },
    },
    fab: {
      position: 'fixed',
      bottom: 16,
      right: 24,
      '& .mdi-icon': {
        fill: 'white',
      },
    },
    fabIcon: {
      '& .mdi-icon': {
        fill: 'white',
      },
    },
    secondaryIcon: {
      backgroundColor: THEME.SECONDARY,
      '&:hover': {
        backgroundColor: fade(THEME.SECONDARY, 0.9),
      },
      '& svg': {
        backgroundColor: 'transparent',
      },
    },
    successIcon: {
      backgroundColor: success.main,
      '&:hover': {
        backgroundColor: success.dark,
      },
      '& svg': {
        backgroundColor: 'transparent',
      },
    },
    warningIcon: {
      backgroundColor: warning.main,
      '&:hover': {
        backgroundColor: warning.dark,
      },
      '& svg': {
        backgroundColor: 'transparent',
      },
    },
    errorIcon: {
      backgroundColor: error.main,
      '&:hover': {
        backgroundColor: error.dark,
      },
      '& svg': {
        backgroundColor: 'transparent',
      },
    },
    unorderedList: {
      listStyleType: 'square',
      paddingLeft: 32,
    },
  },
  overrides: {
    MuiPaper: {
      root: {
        backgroundColor: isDarkTheme ? THEME.PRIMARY_DARK : THEME.PRIMARY_LIGHT,
      },
    },
    MuiButton: {
      sizeSmall: {
        minWidth: 36,
      },
    },
    MuiFab: {
      extended: {
        height: 36,
      },
    },
    MuiCircularProgress: {
      colorPrimary: {
        color: isDarkTheme ? THEME.PRIMARY_LIGHT : THEME.PRIMARY_DARK,
      },
    },
    MuiMobileStepper: {
      dotActive: {
        backgroundColor: isDarkTheme ? 'white' : '#000',
      },
    },
    MuiTableCell: {
      root: {
        borderBottom: `1px solid ${
          isDarkTheme ? THEME.TEN_PERCENT_WHITE : THEME.TEN_PERCENT_BLACK
        }`,
        whiteSpace: 'nowrap',
        padding: '4px 24px 4px 16px',
      },
    },
    MuiPickersYear: {
      root: {
        '&:focus': {
          color: isDarkTheme ? 'white' : '#000',
        },
      },
      selected: {
        color: isDarkTheme ? 'white' : '#000',
      },
    },
    MuiPickersDay: {
      selected: {
        backgroundColor: THEME.SECONDARY,
      },
      current: {
        color: isDarkTheme ? 'white' : '#000',
      },
    },
    MuiPickersModal: {
      dialogAction: {
        color: isDarkTheme ? 'white' : '#000',
        '&:hover': {
          backgroundColor: isDarkTheme
            ? THEME.TEN_PERCENT_WHITE
            : THEME.TEN_PERCENT_BLACK,
        },
      },
    },
  },
});
const theme = createMuiTheme(createTheme(true));

export default {
  lightTheme: createMuiTheme(createTheme(false)),
  darkTheme: theme,
  styleguide: {
    StyleGuide: {
      root: {
        overflowY: 'scroll',
        minHeight: '100vh',
        backgroundColor: THEME.DARK_THEME_BACKGROUND,
        color: theme.palette.text.primary,
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
    color: {
      base: theme.palette.text.primary,
      link: theme.palette.text.primary,
      linkHover: theme.palette.text.primary,
      border: theme.palette.divider,
      baseBackground: THEME.DARK_THEME_BACKGROUND,
      sidebarBackground: theme.palette.primary.main,
      codeBackground: theme.palette.primary.main,
    },
    sidebarWidth: THEME.DRAWER_WIDTH,
    maxWidth: '100vw',
  },
};
