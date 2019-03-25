import React, { Component } from 'react';
import classNames from 'classnames';
import { string } from 'prop-types';
import { withStyles } from '@material-ui/core';
import Button from '../Button';

@withStyles({
  skipButton: {
    position: 'absolute',
    left: -999,
    '&:focus': {
      left: 'unset',
      zIndex: 999,
    },
  },
})
export default class SkipNavigation extends Component {
  static propTypes = {
    /** A selector to jump to. */
    selector: string,
  };

  static defaultProps = {
    selector: null,
  };

  handleClick = e => {
    const { selector, onClick } = this.props;

    if (selector) {
      const tag = document.querySelector(selector);

      // make element focusable
      tag.setAttribute('tabindex', '0');
      tag.focus();
      tag.removeAttribute('tabindex');
    }

    if (onClick) {
      onClick(e);
    }
  };

  render() {
    const { classes, className, onClick: _, ...props } = this.props;

    return (
      <Button
        variant="contained"
        className={classNames(classes.skipButton, className)}
        onClick={this.handleClick}
        {...props}>
        Skip to main content
      </Button>
    );
  }
}
