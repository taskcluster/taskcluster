import React, { useMemo } from 'react';
import * as runtime from 'react/jsx-runtime';
import { evaluateSync } from '@mdx-js/mdx';
import remarkGfm from 'remark-gfm';

export default function MDX({ children, components }) {
  const Content = useMemo(
    () =>
      evaluateSync(children, {
        ...runtime,
        baseUrl: import.meta.url,
        remarkPlugins: [remarkGfm],
      }).default,
    [children]
  );

  return <Content components={components} />;
}
