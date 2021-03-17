import React, { Component } from 'react';
import classNames from 'classnames';
import { bool } from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Emoticon from './Emoticon';

@withStyles(
  theme => ({
    root: {
      textAlign: 'center',
    },
    emoticon: {
      position: 'fixed',
      height: '50%',
      right: 0,
      width: '100%',
    },
    docsEmoticonWidth: {
      [theme.breakpoints.up('md')]: {
        width: `calc(100% - ${theme.docsDrawerWidth}px)`,
      },
    },
    typography: {
      fontFamily: 'Roboto',
      fontWeight: 500,
    },
    icon: {
      fill: theme.palette.primary.main,
    },
  }),
  { withTheme: true }
)
export default class NotFound extends Component {
  static propTypes = {
    /** Set to true if this component is being used by the docs page. */
    isDocs: bool,
  };

  static defaultProps = {
    isDocs: false,
  };

  render() {
    const { classes, theme, isDocs } = this.props;

    return (
      <div className={classes.root}>
        <Typography variant="h4" className={classes.typography}>
          We couldn&apos;t find a page at that address.
          <br />
          <br />
          <br />
        </Typography>
        <Emoticon
          className={classNames(classes.emoticon, {
            [classes.docsEmoticonWidth]: isDocs,
          })}
          fill={theme.palette.text.primary}
        />
      </div>
    );
  }
}
