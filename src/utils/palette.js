import amber from '@material-ui/core/colors/amber';
import blue from '@material-ui/core/colors/blue';
import green from '@material-ui/core/colors/green';

export default {
  info: {
    ...blue,
    contrastText: 'white',
  },
  warning: {
    main: amber[500],
    dark: amber[700],
    light: amber[200],
    contrastText: 'rgba(0, 0, 0, 0.87)',
  },
  success: {
    main: green[500],
    dark: green[800],
    contrastText: 'white',
  },
};
