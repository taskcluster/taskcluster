import React, { Component } from 'react';
import { oneOf } from 'prop-types';
import { Link as LinkNavigation } from 'react-router-dom';
import views from '../App/views';

export default class Link extends Component {
  constructor(props) {
    super(props);
    this.fetched = false;
  }

  static propTypes = {
    viewName: oneOf(Object.keys(views)),
  };

  static defaultProps = {
    viewName: null,
  };

  prefetch = () => {
    const { viewName } = this.props;

    if (viewName && !this.fetched) {
      const view = views[viewName];

      this.fetched = true;
      view.preload();
    }
  };

  handleFocus = e => {
    const { onFocus } = this.props;

    this.prefetch();

    if (onFocus) {
      onFocus(e);
    }
  };

  handleMouseOver = e => {
    const { onMouseOver } = this.props;

    this.prefetch();

    if (onMouseOver) {
      onMouseOver(e);
    }
  };

  render() {
    const { viewName: _, ...props } = this.props;

    return (
      <LinkNavigation
        {...props}
        onFocus={this.handleFocus}
        onMouseOver={this.handleMouseOver}
      />
    );
  }
}
