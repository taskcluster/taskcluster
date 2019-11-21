import React from 'react';
import { withStyles } from '@material-ui/core/styles';
import { THEME } from '../../../../utils/constants';

const styles = theme => ({
  container: {
    width: '100%',
    overflow: 'auto',
    marginBottom: 4 * theme.spacing(1),
  },
  table: {
    display: 'table',
    fontFamily: theme.typography.fontFamily,
    width: '100%',
    borderCollapse: 'collapse',
    borderSpacing: 0,
    overflowX: 'auto',
    overflow: 'hidden',
    '& thead': {
      display: 'table-header-group',
      color: theme.palette.text.secondary,
      fontSize: theme.typography.pxToRem(12),
      fontWeight: theme.typography.fontWeightMedium,

      '& tr': {
        height: 64,
      },
    },
    '& tbody': {
      lineHeight: 1.5,
      color: theme.palette.text.primary,
    },
    '& td': {
      color: theme.palette.text.primary,
      fontSize: theme.typography.pxToRem(13),
      fontWeight: theme.typography.fontWeightRegular,
      borderBottom: `1px solid ${
        theme.palette.type === 'dark'
          ? THEME.TEN_PERCENT_WHITE
          : THEME.TEN_PERCENT_BLACK
      }`,
      whiteSpace: 'nowrap',
      padding: '4px 56px 4px 24px',
      textAlign: 'left',
      '&:last-child': {
        paddingRight: theme.spacing(3),
      },
    },
    '& td code': {
      lineHeight: 1.4,
    },
    '& th': {
      whiteSpace: 'pre',
      fontWeight: theme.typography.fontWeightMedium,
      padding: '4px 56px 4px 24px',
      textAlign: 'left',
      '&:last-child': {
        paddingRight: theme.spacing(3),
      },
    },
    '& tr': {
      color: 'inherit',
      display: 'table-row',
      height: 48,
      verticalAlign: 'middle',
    },
  },
});

function Table({ classes, ...props }) {
  return (
    <div className={classes.container}>
      <table className={classes.table} {...props} />
    </div>
  );
}

export default withStyles(styles)(Table);
