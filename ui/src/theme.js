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
  contrastText: THEME.PRIMARY_TEXT_DARK,
};
const warning = {
  main: amber[500],
  dark: amber[700],
  light: amber[200],
  contrastText: THEME.PRIMARY_TEXT_LIGHT,
};
const error = {
  main: red[500],
  dark: red[700],
  light: red[300],
  contrastText: THEME.PRIMARY_TEXT_DARK,
};
const createTheme = isDarkTheme => {
  const primaryMain = isDarkTheme ? THEME.PRIMARY_DARK : THEME.PRIMARY_LIGHT;
  const textPrimary = isDarkTheme
    ? THEME.PRIMARY_TEXT_DARK
    : THEME.PRIMARY_TEXT_LIGHT;
  const textSecondary = isDarkTheme
    ? THEME.SECONDARY_TEXT_DARK
    : THEME.SECONDARY_TEXT_LIGHT;
  const textHint = isDarkTheme
    ? 'rgba(255, 255, 255, 0.5)'
    : 'rgba(0, 0, 0, 0.5)';
  const backgroundPaper = THEME.WHITE;
  const TYPOGRAPHY = {
    H1: Roboto300,
    H2: Roboto400,
    H3: Roboto400,
    H4: Roboto400,
    H5: Roboto400,
    H6: Roboto500,
    SUBTITLE1: Roboto400,
    SUBTITLE2: Roboto500,
    BODY1: Roboto400,
    BODY2: Roboto400,
    CAPTION: Roboto400,
    BUTTON: Roboto500,
  };
  const FONT_WEIGHTS = {
    LIGHT: 300,
    REGULAR: 400,
    MEDIUM: 500,
    DARK: 600,
  };

  return {
    palette: {
      type: isDarkTheme ? 'dark' : 'light',
      background: {
        default: isDarkTheme ? THEME.DARK_THEME_BACKGROUND : '#fff',
        paper: backgroundPaper,
      },
      primary: {
        main: primaryMain,
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
        primary: textPrimary,
        secondary: textSecondary,
        disabled: isDarkTheme
          ? 'rgba(255, 255, 255, 0.5)'
          : 'rgba(0, 0, 0, 0.5)',
        hint: textHint,
        icon: isDarkTheme ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)',
        active: isDarkTheme ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.9)',
        inactive: isDarkTheme
          ? 'rgba(255, 255, 255, 0.4)'
          : 'rgba(0, 0, 0, 0.4)',
      },
    },
    typography: {
      ...Roboto400,
      h1: TYPOGRAPHY.H1,
      h2: TYPOGRAPHY.H2,
      h3: TYPOGRAPHY.H3,
      h4: TYPOGRAPHY.H4,
      h5: TYPOGRAPHY.H5,
      h6: TYPOGRAPHY.H6,
      subtitle1: TYPOGRAPHY.SUBTITLE1,
      subtitle2: TYPOGRAPHY.SUBTITLE2,
      body1: TYPOGRAPHY.BODY1,
      body2: TYPOGRAPHY.BODY2,
      caption: TYPOGRAPHY.CAPTION,
      button: TYPOGRAPHY.BUTTON,
      fontWeightLight: FONT_WEIGHTS.LIGHT,
      fontWeightRegular: FONT_WEIGHTS.REGULAR,
      fontWeightMedium: FONT_WEIGHTS.MEDIUM,
      fontWeightDark: FONT_WEIGHTS.DARK,
    },
    spacing: 8,
    drawerWidth: THEME.DRAWER_WIDTH,
    docsDrawerWidth: THEME.DRAWER_WIDTH + 125,
    mixins: {
      link: {
        color: textPrimary,
        textDecoration: 'none',
        borderBottom: `2px solid ${lighten(
          THEME.SECONDARY,
          THEME.TONAL_OFFSET
        )}`,
        '&:hover': {
          borderBottom: `2px solid ${THEME.SECONDARY}`,
        },
      },
      highlight: {
        backgroundColor: isDarkTheme
          ? THEME.TEN_PERCENT_WHITE
          : THEME.TEN_PERCENT_BLACK,
        fontFamily: 'Consolas, "Liberation Mono", Menlo, Courier, monospace',
        lineHeight: 1.4,
        display: 'inline-block',
        fontSize: '0.875rem',
        color: textPrimary,
      },
      listItemButton: {
        '& svg': {
          transition: transitions.create('fill'),
          fill: lighten(
            isDarkTheme ? THEME.PRIMARY_TEXT_LIGHT : THEME.PRIMARY_TEXT_LIGHT,
            0.4
          ),
        },
        '&:hover svg, &:focus svg': {
          fill: textPrimary,
        },
      },
      hover: {
        '&:hover, &:focus': {
          textDecoration: 'none',
          backgroundColor: fade(textPrimary, 0.08),
          // Reset on touch devices, it doesn't add specificity
          '@media (hover: none)': {
            backgroundColor: 'transparent',
          },
          '&:disabled': {
            backgroundColor: 'transparent',
          },
          // Rely on background color instead
          outline: 'none',
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
        wordWrap: 'break-word',
        listStyleType: 'square',
        paddingLeft: 32,
      },
      // An action button is usually located bottom right
      // of the screen. The class should be used on the Button component
      // to ensure other components (e.g., code editors) are not sitting on top.
      actionButton: {
        zIndex: 1050,
      },
    },
    overrides: {
      MuiTypography: {
        root: {
          color: textPrimary,
        },
      },
      MuiTableSortLabel: {
        icon: {
          fontSize: '1rem',
        },
      },
      MuiPaper: {
        root: {
          backgroundColor: primaryMain,
          color: 'inherit',
        },
      },
      MuiFormLabel: {
        filled: {
          ...Roboto500,
          color: isDarkTheme
            ? THEME.PRIMARY_TEXT_DARK
            : THEME.PRIMARY_TEXT_LIGHT,
        },
      },
      MuiListSubheader: {
        root: {
          ...Roboto500,
          color: isDarkTheme
            ? THEME.PRIMARY_TEXT_DARK
            : THEME.PRIMARY_TEXT_LIGHT,
        },
      },
      MuiButton: {
        sizeSmall: {
          minWidth: 36,
        },
      },
      MuiFab: {
        sizeSmall: {
          minWidth: 36,
        },
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
        },
      },
      MuiPickersToolbar: {
        toolbar: {
          backgroundColor: THEME.SECONDARY,
        },
      },
      MuiPickersToolbarText: {
        toolbarTxt: {
          color: THEME.PRIMARY_TEXT_DARK,
        },
        toolbarBtnSelected: {
          color: THEME.PRIMARY_TEXT_DARK,
        },
      },
      MuiPickersToolbarButton: {
        toolbarBtn: {
          '&:hover, &:focus': {
            textDecoration: 'none',
            backgroundColor: fade(textPrimary, 0.08),
            // Reset on touch devices, it doesn't add specificity
            '@media (hover: none)': {
              backgroundColor: 'transparent',
            },
            '&:disabled': {
              backgroundColor: 'transparent',
            },
            // Rely on background color instead
            outline: 'none',
          },
        },
      },
      MuiPickersYear: {
        root: {
          '&:focus': {
            color: isDarkTheme
              ? THEME.PRIMARY_TEXT_DARK
              : THEME.PRIMARY_TEXT_LIGHT,
          },
          '&$yearSelected': {
            color: isDarkTheme
              ? THEME.PRIMARY_TEXT_DARK
              : THEME.PRIMARY_TEXT_LIGHT,
          },
        },
      },
      MuiListItem: {
        root: {
          userSelect: 'text',
        },
      },
      MuiChip: {
        label: {
          userSelect: 'text',
        },
        root: {
          userSelect: 'text',
        },
      },
      MuiPickersCalendarHeader: {
        iconButton: {
          backgroundColor: 'transparent',
          '& span': {
            backgroundColor: 'transparent',
          },
        },
      },
      MuiPickersDay: {
        daySelected: {
          backgroundColor: THEME.SECONDARY,
          color: THEME.PRIMARY_TEXT_DARK,
          '&:hover': {
            backgroundColor: THEME.SECONDARY,
          },
        },
        current: {
          color: isDarkTheme
            ? THEME.PRIMARY_TEXT_DARK
            : THEME.PRIMARY_TEXT_LIGHT,
        },
        day: {
          color: isDarkTheme
            ? 'rgba(255, 255, 255, 0.7)'
            : 'rgba(0, 0, 0, 0.7)',
        },
      },
      MuiPickersModal: {
        dialogAction: {
          color: isDarkTheme
            ? THEME.PRIMARY_TEXT_DARK
            : THEME.PRIMARY_TEXT_LIGHT,
          '&:hover': {
            backgroundColor: isDarkTheme
              ? THEME.TEN_PERCENT_WHITE
              : THEME.TEN_PERCENT_BLACK,
          },
        },
      },
      MuiDialogActions: {
        root: {
          '& button': {
            color: isDarkTheme
              ? THEME.PRIMARY_TEXT_DARK
              : THEME.PRIMARY_TEXT_LIGHT,
            '&:hover': {
              backgroundColor: isDarkTheme
                ? THEME.TEN_PERCENT_WHITE
                : THEME.TEN_PERCENT_BLACK,
            },
          },
        },
      },
      MuiDrawer: {
        paper: {
          maxWidth: 500,
        },
      },
      MuiExpansionPanelSummary: {
        root: {
          '&$focused': {
            backgroundColor: THEME.TEN_PERCENT_WHITE,
          },
        },
      },
    },
  };
};

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
      border: THEME.DIVIDER,
      baseBackground: THEME.DARK_THEME_BACKGROUND,
      sidebarBackground: theme.palette.primary.main,
      codeBackground: theme.palette.primary.main,
    },
    sidebarWidth: THEME.DRAWER_WIDTH,
    maxWidth: '100vw',
  },
};
