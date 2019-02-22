import React, { Component } from 'react';
import { string } from 'prop-types';
import classNames from 'classnames';
import parser from 'markdown-it';
import linkAttributes from 'markdown-it-link-attributes';
import highlighter from 'markdown-it-highlightjs';
import { withStyles } from '@material-ui/core/styles';
import 'highlight.js/styles/atom-one-dark.css';

const markdown = parser({ linkify: true });

markdown.use(highlighter);
markdown.use(linkAttributes, {
  attrs: {
    target: '_blank',
    rel: 'noopener noreferrer',
  },
});

@withStyles(theme => ({
  root: {
    ...theme.mixins.markdown,
  },
}))
/**
 * Render children as syntax-highlighted monospace code.
 */
export default class Markdown extends Component {
  static propTypes = {
    /**
     * The content to render as Markdown.
     */
    children: string.isRequired,
  };

  render() {
    const { classes, children, className, ...props } = this.props;

    /* eslint-disable react/no-danger */
    return (
      <span
        className={classNames(classes.root, className)}
        dangerouslySetInnerHTML={{
          __html: markdown.render(children),
        }}
        {...props}
      />
    );
    /* eslint-enable react/no-danger */
  }
}
