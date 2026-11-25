import { useMemo } from 'react';
import classNames from 'classnames';
import hljs from 'highlight.js';
import 'highlight.js/styles/atom-one-dark.css';

export interface CodeProps {
  /** The content to render as highlighted syntax. */
  children: string;
  /** A highlight.js language identifier. */
  language: string;
  className?: string;
}

/**
 * Render children as syntax-highlighted monospace code.
 */
export default function Code({ children, language, className }: CodeProps) {
  const code = useMemo(
    () => hljs.highlight(children, { language, ignoreIllegals: true }).value,
    [children, language]
  );

  return (
    <pre className={classNames(`language-${language}`, className)}>
      {code && (
        // biome-ignore lint/security/noDangerouslySetInnerHtml: highlight.js produces sanitized HTML
        <code dangerouslySetInnerHTML={{ __html: code }} />
      )}
    </pre>
  );
}
