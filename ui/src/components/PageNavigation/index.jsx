import React, { Fragment, Component } from 'react';
import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import ArrowRightIcon from 'mdi-react/ArrowRightIcon';
import ArrowLeftIcon from 'mdi-react/ArrowLeftIcon';
import { string, oneOf } from 'prop-types';
import Link from '../../utils/Link';
import Button from '../Button';

@withStyles(theme => ({
  button: {
    margin: theme.spacing(1),
  },
  rightIcon: {
    marginLeft: theme.spacing(1),
  },
  rightButtonText: {
    display: 'flex',
    flexDirection: 'column',
    textAlign: 'left',
  },
  leftIcon: {
    marginRight: theme.spacing(1),
  },
  leftButtonText: {
    display: 'flex',
    flexDirection: 'column',
    textAlign: 'right',
  },
  link: {
    textDecoration: 'none',
    '&:hover': {
      textDecoration: 'none',
    },
  },
}))
/**
 * Page navigation for documentation
 */
export default class PageNavigation extends Component {
  static propTypes = {
    /** The variant to use. */
    variant: oneOf(['prev', 'next']).isRequired,
    /** The location to navigate to. */
    to: string.isRequired,
  };

  render() {
    const { classes, variant, to, children, ...props } = this.props;

    return (
      <Link className={classes.link} to={to}>
        <Button variant="outlined" className={classes.button} {...props}>
          <Fragment>
            {variant === 'prev' && (
              <ArrowLeftIcon className={classes.leftIcon} />
            )}
            <div
              className={
                variant === 'prev'
                  ? classes.leftButtonText
                  : classes.rightButtonText
              }>
              <Typography variant="caption" color="textSecondary">
                {variant}
              </Typography>
              <Typography variant="button">{children}</Typography>
            </div>
            {variant === 'next' && (
              <ArrowRightIcon className={classes.rightIcon} />
            )}
          </Fragment>
        </Button>
      </Link>
    );
  }
}
