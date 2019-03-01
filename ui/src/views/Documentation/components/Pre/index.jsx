import React from 'react';
import { withStyles } from '@material-ui/core/styles';
import { THEME } from '../../../../utils/constants';

const useStyles = withStyles(theme => ({
  pre: {
    width: '100%',
    '& code': {
      lineHeight: 1.4,
      '&[class*="language-"]': {
        textShadow: 'none',
      },
    },
    '&, & pre[class*="language-"]': {
      margin: `${theme.spacing.triple}px 0`,
      padding: '12px 18px',
      backgroundColor: THEME.PRIMARY_DARK,
      borderRadius: 3,
      overflow: 'auto',
    },
    '& code:not([class])': {
      ...theme.mixins.highlight,
      backgroundColor: 'unset',
      color: THEME.PRIMARY_TEXT_DARK,
    },
    '& .token.operator': {
      color: 'none',
      background: 'none',
    },
  },
}));

function Pre({ classes, ...props }) {
  return <pre className={classes.pre} {...props} />;
}

export default useStyles(Pre);
