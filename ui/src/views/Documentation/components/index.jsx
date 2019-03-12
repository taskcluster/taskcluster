import React from 'react';
import Anchor from './Anchor';
import Blockquote from './Blockquote';
import HeaderWithAnchor from './HeaderWithAnchor';
import Paragraph from './Paragraph';
import Table from './Table';
import ListItem from './ListItem';
import List from './List';
import InlineCode from './InlineCode';
import Pre from './Pre';

// eslint-disable-next-line react/display-name
const heading = variant => ({ children, id, ...props }) => (
  <HeaderWithAnchor type={variant} id={id} {...props}>
    {children}
  </HeaderWithAnchor>
);
const a = props => <Anchor {...props} />;
const p = props => <Paragraph {...props} />;
const table = props => <Table {...props} />;
const blockquote = props => <Blockquote {...props} />;
const li = props => <ListItem {...props} />;
const inlineCode = props => <InlineCode {...props} />;
const pre = props => <Pre {...props} />;
const ul = props => <List {...props} />;

// Returns a mapping between the HTML element and the desired component
export default {
  a,
  h1: heading('h1'),
  h2: heading('h2'),
  h3: heading('h3'),
  h4: heading('h4'),
  h5: heading('h5'),
  h6: heading('h6'),
  p,
  table,
  blockquote,
  li,
  inlineCode,
  pre,
  ul,
};
