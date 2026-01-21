import React from 'react';
import classNames from 'classnames';
import { withStyles } from '@material-ui/core/styles';
import { THEME } from '../../../../utils/constants';

const styles = theme => ({
  pre: {
    width: '100%',
    fontSize: theme.typography.fontSize,
    '& code': {
      lineHeight: 1.4,
      '&[class*="language-"]': {
        textShadow: 'none',
      },
    },
    '&, & pre[class*="language-"]': {
      margin: `${theme.spacing(3)}px 0`,
      padding: '12px 18px',
      backgroundColor: `${THEME.PRIMARY_DARK} !important`,
      borderRadius: 3,
      overflow: 'auto',
    },
    '& code:not([class])': {
      ...theme.mixins.highlight,
      fontSize: 'unset',
      backgroundColor: 'unset',
      color: THEME.PRIMARY_TEXT_DARK,
    },
    '& .token.operator, & .token.punctuation': {
      background: 'transparent !important',
    },
  },
});

function Pre({ classes, className, ...props }) {
  return <pre className={classNames(classes.pre, className)} {...props} />;
}

export default withStyles(styles)(Pre);
