import React, { Component } from 'react';
import { string } from 'prop-types';
import hljs from 'highlight.js';
import classNames from 'classnames';
import 'highlight.js/styles/atom-one-dark.css';

const validLanguage = (props, propName) => {
  const language = props[propName];

  if (!hljs.getLanguage(language)) {
    return new Error(`Language '${language}' not supported by highlight.js`);
  }
};

/**
 * Render children as syntax-highlighted monospace code.
 */
export default class Code extends Component {
  static propTypes = {
    /**
     * The content to render as highlighted syntax.
     */
    children: string.isRequired,
    /**
     * A highlight.js language identifier.
     */
    language: validLanguage,
    /** The CSS class name of the wrapper element */
    className: string,
  };

  static defaultProps = {
    className: null,
  };

  render() {
    const { children, language, className, ...props } = this.props;
    const code = hljs.highlight(children, {
      language,
      ignoreIllegals: true,
    }).value;

    /* eslint-disable react/no-danger */
    return (
      <pre className={classNames(`language-${language}`, className)} {...props}>
        {code && <code dangerouslySetInnerHTML={{ __html: code }} />}
      </pre>
    );
    /* eslint-enable react/no-danger */
  }
}
