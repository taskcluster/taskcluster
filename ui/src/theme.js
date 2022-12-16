import { alpha, createTheme } from '@material-ui/core/styles';
import { lighten } from '@material-ui/core/styles/colorManipulator';
import transitions from '@material-ui/core/styles/transitions';
import red from '@material-ui/core/colors/red';
import amber from '@material-ui/core/colors/amber';
import blue from '@material-ui/core/colors/blue';
import green from '@material-ui/core/colors/green';
import purple from '@material-ui/core/colors/purple';
import { THEME } from './utils/constants';

const Roboto300 = { fontFamily: 'Roboto, sans-serif', fontWeight: 300 };
const Roboto400 = { fontFamily: 'Roboto, sans-serif', fontWeight: 400 };
const Roboto500 = { fontFamily: 'Roboto, sans-serif', fontWeight: 500 };
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
const specific = {
  main: purple[500],
  dark: purple[700],
  light: purple[200],
  contrastText: THEME.PRIMARY_TEXT_LIGHT,
};
const themeOptions = isDarkTheme => {
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
  const theme = createTheme({
    breakpoints: {
      values: {
        xs: 0,
        sm: 600,
        md: 900,
        lg: 1100,
        xl: 1500,
      },
    },
  });

  return {
    palette: {
      type: isDarkTheme ? 'dark' : 'light',
      background: {
        default: isDarkTheme ? THEME.DARK_THEME_BACKGROUND : '#fff',
        paper: primaryMain,
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
      specific: {
        ...purple,
        ...specific,
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
      diff: {
        red: {
          line: '#7b1219',
          word: '#9c0e13',
        },
        green: {
          line: '#0b711c',
          word: '#098d16',
        },
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
        fontSize: '0.875em',
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
          backgroundColor: alpha(textPrimary, 0.08),
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
          backgroundColor: alpha(THEME.SECONDARY, 0.9),
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
      MuiSelect: {
        root: {
          paddingLeft: '7px',
        },
      },
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
      MuiTableHead: {
        root: {
          width: '100%',
          [theme.breakpoints.down('md')]: {
            display: 'block',
            position: 'absolute',
            top: '-9999px',
            left: '-9999px',
          },
        },
      },
      MuiTableRow: {
        root: {
          width: '100%',
          [theme.breakpoints.down('md')]: {
            display: 'block',
            borderRadius: '5%',
            borderCollapse: 'separate',
          },
        },
      },
      MuiTableBody: {
        root: {
          width: '100%',
          [theme.breakpoints.down('md')]: {
            display: 'block',
          },
        },
      },
      MuiTableCell: {
        root: {
          [theme.breakpoints.down('md')]: {
            display: 'block',
            position: 'relative',
            paddingLeft: '50%',
          },
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
          color: 'rgba(255, 255, 255, 0.54)',
        },
        toolbarBtnSelected: {
          color: THEME.PRIMARY_TEXT_DARK,
        },
      },
      MuiPickersToolbarButton: {
        toolbarBtn: {
          '&:hover, &:focus': {
            textDecoration: 'none',
            backgroundColor: alpha(textPrimary, 0.08),
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
      MuiPickersClock: {
        pin: {
          backgroundColor: THEME.SECONDARY,
        },
      },
      MuiPickersClockPointer: {
        pointer: {
          backgroundColor: THEME.SECONDARY,
        },
        thumb: {
          borderColor: THEME.SECONDARY,
          backgroundColor: THEME.PRIMARY_TEXT_DARK,
        },
        noPoint: {
          backgroundColor: THEME.SECONDARY,
        },
      },
      MuiPickersClockNumber: {
        clockNumberSelected: {
          color: '#fff',
        },
      },
      MuiPickerDTTabs: {
        tabs: {
          color: '#fff',
          backgroundColor: THEME.SECONDARY,
          '& .MuiTabs-indicator': {
            backgroundColor: isDarkTheme ? '#fff' : '#000',
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
        withAdditionalAction: {
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
      MuiAccordionSummary: {
        root: {
          '&$focused': {
            backgroundColor: THEME.TEN_PERCENT_WHITE,
          },
        },
      },
      MuiMenuItem: {
        root: {
          color: isDarkTheme
            ? THEME.PRIMARY_TEXT_DARK
            : THEME.PRIMARY_TEXT_LIGHT,
        },
      },
    },
  };
};

const theme = createTheme(themeOptions(true));

export default {
  lightTheme: createTheme(themeOptions(false)),
  darkTheme: theme,
};
