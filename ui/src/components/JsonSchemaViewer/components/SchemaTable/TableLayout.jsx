import React, { Fragment } from 'react';
import classNames from 'classnames';
import { array } from 'prop-types';
import { makeStyles } from '@material-ui/core/styles';

const useStyles = makeStyles(theme => ({
  wrapper: {
    display: 'block',
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: theme.palette.background.paper,
  },

  cell: {
    float: 'left',
    boxSizing: 'border-box',
    borderTop: `${theme.spacing(0.125)}px solid ${theme.palette.divider}`,
    overflowX: 'auto',
  },
  left: {
    width: '50%',
    paddingLeft: theme.spacing(1),
  },
  right: {
    width: '50%',
  },
  break: {
    clear: 'both',
  },
}));

function TableLayout({ rows }) {
  const classes = useStyles();

  /* the approach here is to alternate divs for the left and right, with the
   * CSS configuring them so they fit side-by-side with a clear=all after each
   * right-side diff */

  return (
    <div className={classes.wrapper}>
      {rows.map(({ left, right }, i) => {
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: row order is fully determined by the input schema.R ows are never reordered or filtered between renders
          <Fragment key={`row-${i}`}>
            <div className={classNames(classes.cell, classes.left)}>{left}</div>
            <div className={classNames(classes.cell, classes.right)}>
              {right}
            </div>
            <div className={classes.break} />
          </Fragment>
        );
      })}
    </div>
  );
}

TableLayout.propTypes = {
  /**
   * Array of elements containing {left, right}
   */
  rows: array.isRequired,
};

export default React.memo(TableLayout);
