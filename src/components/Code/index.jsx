import { Component } from 'react';
import { string } from 'prop-types';
import { getLanguage, highlight } from 'highlight.js';
import 'highlight.js/styles/atom-one-dark.css';

const validLanguage = (props, propName) => {
  const language = props[propName];

  if (!getLanguage(language)) {
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
  };

  state = {
    code: null,
  };

  componentDidMount() {
    const { children, language } = this.props;

    this.setState({
      code: highlight(language, children, true).value,
    });
  }

  render() {
    const { language, ...props } = this.props;
    const { code } = this.state;

    /* eslint-disable react/no-danger */
    return (
      <pre className={`language-${language}`} {...props}>
        {code && <code dangerouslySetInnerHTML={{ __html: code }} />}
      </pre>
    );
    /* eslint-enable react/no-danger */
  }
}
