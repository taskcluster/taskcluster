import { alpha, createTheme, lighten } from '@mui/material/styles';
import { red, amber, blue, green, grey, purple } from '@mui/material/colors';
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
    breakpoints: {
      values: {
        xs: 0,
        sm: 600,
        md: 960,
        lg: 1280,
        xl: 1920,
      },
    },
    palette: {
      mode: isDarkTheme ? 'dark' : 'light',
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
          transition: theme.transitions.create('fill'),
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
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          html: {
            colorScheme: isDarkTheme ? 'dark' : 'light',
          },
          body: {
            color: textSecondary,
            fontSize: '0.875rem',
            lineHeight: 1.43,
          },
        },
      },
      MuiTextField: {
        defaultProps: {
          variant: 'standard',
        },
      },
      MuiFormControl: {
        defaultProps: {
          variant: 'standard',
        },
      },
      MuiSelect: {
        defaultProps: {
          variant: 'standard',
        },
        styleOverrides: {
          select: {
            paddingLeft: '7px',
          },
        },
      },
      MuiTypography: {
        styleOverrides: {
          root: {
            color: textPrimary,
          },
        },
      },
      MuiTableSortLabel: {
        styleOverrides: {
          icon: {
            fontSize: '1rem',
          },
        },
      },
      MuiFormLabel: {
        styleOverrides: {
          filled: {
            ...Roboto500,
            color: isDarkTheme
              ? THEME.PRIMARY_TEXT_DARK
              : THEME.PRIMARY_TEXT_LIGHT,
          },
        },
      },
      MuiListSubheader: {
        styleOverrides: {
          root: {
            backgroundColor: 'inherit',
            ...Roboto500,
            color: isDarkTheme
              ? THEME.PRIMARY_TEXT_DARK
              : THEME.PRIMARY_TEXT_LIGHT,
          },
        },
      },
      MuiButton: {
        defaultProps: {
          color: 'inherit',
        },
        styleOverrides: {
          sizeSmall: {
            minWidth: 36,
          },
          textInherit: {
            color: textPrimary,
          },
          outlinedInherit: {
            color: textPrimary,
            borderColor: isDarkTheme
              ? 'rgba(255, 255, 255, 0.23)'
              : 'rgba(0, 0, 0, 0.23)',
          },
          containedInherit: {
            color: 'rgba(0, 0, 0, 0.87)',
            backgroundColor: grey[300],
            '&:hover': {
              backgroundColor: grey.A100,
            },
          },
        },
      },
      MuiFab: {
        styleOverrides: {
          sizeSmall: {
            minWidth: 36,
          },
          extended: {
            height: 36,
          },
        },
      },
      MuiCircularProgress: {
        styleOverrides: {
          colorPrimary: {
            color: isDarkTheme ? THEME.PRIMARY_LIGHT : THEME.PRIMARY_DARK,
          },
        },
      },
      MuiMobileStepper: {
        styleOverrides: {
          dotActive: {
            backgroundColor: isDarkTheme ? 'white' : '#000',
          },
        },
      },
      MuiTableHead: {
        styleOverrides: {
          root: {
            width: '100%',
            [theme.breakpoints.down('lg')]: {
              display: 'block',
              position: 'absolute',
              top: '-9999px',
              left: '-9999px',
            },
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            width: '100%',
            [theme.breakpoints.down('lg')]: {
              display: 'block',
              borderRadius: '5%',
              borderCollapse: 'separate',
            },
          },
        },
      },
      MuiTableBody: {
        styleOverrides: {
          root: {
            width: '100%',
            [theme.breakpoints.down('lg')]: {
              display: 'block',
            },
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            [theme.breakpoints.down('lg')]: {
              display: 'block',
              position: 'relative',
              paddingLeft: '50%',
            },
            borderBottom: `1px solid ${
              isDarkTheme ? THEME.TEN_PERCENT_WHITE : THEME.TEN_PERCENT_BLACK
            }`,
            whiteSpace: 'nowrap',
          },
          sizeSmall: {
            padding: '6px 24px 6px 16px',
            '&:last-child': {
              paddingRight: 16,
            },
            [theme.breakpoints.down('lg')]: {
              paddingLeft: 16,
            },
          },
        },
      },
      MuiListItem: {
        styleOverrides: {
          root: {
            userSelect: 'text',
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          label: {
            userSelect: 'text',
          },
          root: {
            userSelect: 'text',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
          },
        },
      },
      MuiTabs: {
        defaultProps: {
          textColor: 'inherit',
          indicatorColor: 'secondary',
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            [theme.breakpoints.up('sm')]: {
              minWidth: 160,
            },
          },
          textColorInherit: {
            opacity: 0.7,
          },
        },
      },
      MuiSwitch: {
        defaultProps: {
          color: 'secondary',
        },
        styleOverrides: {
          switchBase: {
            color: isDarkTheme ? grey[400] : grey[50],
          },
        },
      },
      MuiCheckbox: {
        defaultProps: {
          color: 'secondary',
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            maxWidth: 500,
          },
        },
      },
      MuiAccordionSummary: {
        styleOverrides: {
          root: {
            '&.Mui-focusVisible': {
              backgroundColor: THEME.TEN_PERCENT_WHITE,
            },
          },
          expandIconWrapper: {
            padding: '0 12px',
            marginRight: -12,
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            color: isDarkTheme
              ? THEME.PRIMARY_TEXT_DARK
              : THEME.PRIMARY_TEXT_LIGHT,
          },
        },
      },
    },
  };
};

export default {
  lightTheme: createTheme(themeOptions(false)),
  darkTheme: createTheme(themeOptions(true)),
};
