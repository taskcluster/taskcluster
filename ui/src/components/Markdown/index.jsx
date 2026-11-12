import React, { Component } from 'react';
import { string } from 'prop-types';
import classNames from 'classnames';
import parser from 'markdown-it';
import linkAttributes from 'markdown-it-link-attributes';
import highlighter from 'markdown-it-highlightjs';
import { alpha } from '@mui/material/styles';
import withStyles from '@mui/styles/withStyles';
import 'highlight.js/styles/atom-one-dark.css';

const markdown = parser({ linkify: true });
const markdownHtml = parser({ html: true, linkify: true });

[markdown, markdownHtml].forEach(md => {
  md.use(highlighter);
  md.use(linkAttributes, {
    attrs: {
      target: '_blank',
      rel: 'noopener noreferrer',
    },
  });
});

@withStyles(theme => ({
  root: {
    fontFamily: theme.typography.fontFamily,
    fontSize: '1em',
    color: theme.palette.text.primary,
    '& > p': {
      margin: 0,
    },
    '& .anchor-link': {
      marginTop: theme.spacing(-12), // Offset for the anchor.
      position: 'absolute',
    },
    '& pre, & pre[class*="language-"]': {
      margin: `${theme.spacing(3)} 0`,
      padding: '12px 18px',
      borderRadius: 3,
      overflow: 'auto',
    },
    '& code': {
      display: 'inline-block',
      lineHeight: 1.6,
      fontFamily: 'Consolas, "Liberation Mono", Menlo, Courier, monospace',
      padding: '3px 6px',
      fontSize: '0.875em',
    },
    '& p code, & ul code, & pre code': {
      fontSize: '0.875em',
      lineHeight: 1.6,
    },
    '& h1': {
      ...theme.typography.h3,
      color: theme.palette.text.secondary,
      margin: '0.7em 0',
    },
    '& h2': {
      ...theme.typography.h4,
      color: theme.palette.text.secondary,
      margin: '1em 0 0.7em',
    },
    '& h3': {
      ...theme.typography.h5,
      color: theme.palette.text.secondary,
      margin: '1em 0 0.7em',
    },
    '& h4': {
      ...theme.typography.h6,
      color: theme.palette.text.secondary,
      margin: '1em 0 0.7em',
    },
    '& p, & ul, & ol': {
      lineHeight: 1.6,
    },
    '& h1, & h2, & h3, & h4': {
      '& code': {
        fontSize: 'inherit',
        lineHeight: 'inherit',
        // Remove scroll on small screens.
        wordBreak: 'break-word',
      },
      '& .anchor-link-style': {
        opacity: 0,
        // To prevent the link to get the focus.
        display: 'none',
      },
      '&:hover .anchor-link-style': {
        display: 'inline-block',
        opacity: 1,
        padding: `0 ${theme.spacing(1)}`,
        color: theme.palette.text.hint,
        '&:hover': {
          color: theme.palette.text.secondary,
        },
        '& svg': {
          width: '0.55em',
          height: '0.55em',
          fill: 'currentColor',
        },
      },
    },
    '& table': {
      width: '100%',
      display: 'block',
      overflowX: 'auto',
      borderCollapse: 'collapse',
      borderSpacing: 0,
      overflow: 'hidden',
      '& .prop-name': {
        fontSize: '0.8125em',
        fontFamily: 'Consolas, "Liberation Mono", Menlo, monospace',
      },
      '& .required': {
        color: theme.palette.mode === 'light' ? '#006500' : '#9bc89b',
      },
      '& .prop-type': {
        fontSize: '0.8125em',
        fontFamily: 'Consolas, "Liberation Mono", Menlo, monospace',
        color: theme.palette.mode === 'light' ? '#932981' : '#dbb0d0',
      },
      '& .prop-default': {
        fontSize: '0.8125em',
        fontFamily: 'Consolas, "Liberation Mono", Menlo, monospace',
        borderBottom: `1px dotted ${theme.palette.text.hint}`,
      },
    },
    '& thead': {
      fontSize: '0.875em',
      fontWeight: theme.typography.fontWeightMedium,
      color: theme.palette.text.secondary,
    },
    '& tbody': {
      fontSize: '0.875em',
      lineHeight: 1.5,
      color: theme.palette.text.primary,
    },
    '& td': {
      borderBottom: `1px solid ${theme.palette.divider}`,
      padding: `${theme.spacing(1)} ${theme.spacing(2)} ${theme.spacing(
        1
      )} ${theme.spacing(1)}`,
      textAlign: 'left',
    },
    '& td:last-child': {
      paddingRight: theme.spacing(3),
    },
    '& td compact': {
      paddingRight: theme.spacing(3),
    },
    '& td code': {
      fontSize: '.8125em',
      lineHeight: 1.6,
    },
    '& th': {
      whiteSpace: 'pre',
      borderBottom: `1px solid ${theme.palette.divider}`,
      fontWeight: theme.typography.fontWeightMedium,
      padding: `0 ${theme.spacing(2)} 0 ${theme.spacing(1)}`,
      textAlign: 'left',
    },
    '& th:last-child': {
      paddingRight: theme.spacing(3),
    },
    '& tr': {
      height: 48,
    },
    '& thead tr': {
      height: 64,
    },
    '& strong': {
      fontWeight: theme.typography.fontWeightMedium,
    },
    '& blockquote': {
      borderLeft: `5px solid ${theme.palette.text.hint}`,
      padding: `${theme.spacing(0.5)} ${theme.spacing(3)}`,
      margin: `${theme.spacing(3)} 0`,
    },
    '& img': {
      maxWidth: '100%',
    },
    '& a': {
      color: 'inherit',
      ...theme.mixins.link,
    },
    '& :not(pre) > code': {
      backgroundColor:
        theme.palette.mode === 'dark' ? alpha('#fff', 0.1) : alpha('#000', 0.1),
    },
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
    const { classes, children, className, allowHtml, ...props } = this.props;
    const md = allowHtml ? markdownHtml : markdown;

    return (
      <span
        className={classNames(classes.root, className)}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: markdown-it output (sanitized unless allowHtml)
        dangerouslySetInnerHTML={{
          __html: md.render(children),
        }}
        {...props}
      />
    );
  }
}
