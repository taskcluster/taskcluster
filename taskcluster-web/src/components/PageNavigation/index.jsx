import React, { Fragment, Component } from 'react';
import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import ArrowRightIcon from 'mdi-react/ArrowRightIcon';
import ArrowLeftIcon from 'mdi-react/ArrowLeftIcon';
import { oneOf } from 'prop-types';
import Button from '../Button';

@withStyles(theme => ({
  button: {
    margin: theme.spacing.unit,
  },
  rightIcon: {
    marginLeft: theme.spacing.unit,
  },
  rightButtonText: {
    display: 'flex',
    flexDirection: 'column',
    textAlign: 'left',
  },
  leftIcon: {
    marginRight: theme.spacing.unit,
  },
  leftButtonText: {
    display: 'flex',
    flexDirection: 'column',
    textAlign: 'right',
  },
}))
/**
 * Page navigation for documentation
 */
export default class PageNavigation extends Component {
  static propTypes = {
    /** The variant to use. */
    variant: oneOf(['prev', 'next']).isRequired,
  };

  render() {
    const { classes, variant } = this.props;

    return (
      <Button {...this.props} variant="outlined" className={classes.button}>
        <Fragment>
          {variant === 'prev' && <ArrowLeftIcon className={classes.leftIcon} />}
          <div
            className={
              variant === 'prev'
                ? classes.leftButtonText
                : classes.rightButtonText
            }>
            <Typography variant="caption" color="textSecondary">
              {variant}
            </Typography>
            <Typography variant="button">{this.props.children}</Typography>
          </div>
          {variant === 'next' && (
            <ArrowRightIcon className={classes.rightIcon} />
          )}
        </Fragment>
      </Button>
    );
  }
}
