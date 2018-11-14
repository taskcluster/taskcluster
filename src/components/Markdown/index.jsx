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
    fontFamily: theme.typography.fontFamily,
    color: theme.palette.text.primary,
    '& > p': {
      margin: 0,
    },
    '& .anchor-link': {
      marginTop: -theme.spacing.unit * 12, // Offset for the anchor.
      position: 'absolute',
    },
    '& pre, & pre[class*="language-"]': {
      margin: `${3 * theme.spacing.unit}px 0`,
      padding: '12px 18px',
      backgroundColor: theme.palette.background.paper,
      borderRadius: 3,
      overflow: 'auto',
    },
    '& code': {
      display: 'inline-block',
      lineHeight: 1.6,
      fontFamily: 'Consolas, "Liberation Mono", Menlo, Courier, monospace',
      padding: '3px 6px',
      color: theme.palette.text.primary,
      backgroundColor: theme.palette.background.paper,
      fontSize: 14,
    },
    '& p code, & ul code, & pre code': {
      fontSize: 14,
      lineHeight: 1.6,
    },
    '& h1': {
      ...theme.typography.display2,
      color: theme.palette.text.secondary,
      margin: '0.7em 0',
    },
    '& h2': {
      ...theme.typography.display1,
      color: theme.palette.text.secondary,
      margin: '1em 0 0.7em',
    },
    '& h3': {
      ...theme.typography.headline,
      color: theme.palette.text.secondary,
      margin: '1em 0 0.7em',
    },
    '& h4': {
      ...theme.typography.title,
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
        padding: `0 ${theme.spacing.unit}px`,
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
        fontSize: 13,
        fontFamily: 'Consolas, "Liberation Mono", Menlo, monospace',
      },
      '& .required': {
        color: theme.palette.type === 'light' ? '#006500' : '#9bc89b',
      },
      '& .prop-type': {
        fontSize: 13,
        fontFamily: 'Consolas, "Liberation Mono", Menlo, monospace',
        color: theme.palette.type === 'light' ? '#932981' : '#dbb0d0',
      },
      '& .prop-default': {
        fontSize: 13,
        fontFamily: 'Consolas, "Liberation Mono", Menlo, monospace',
        borderBottom: `1px dotted ${theme.palette.text.hint}`,
      },
    },
    '& thead': {
      fontSize: 14,
      fontWeight: theme.typography.fontWeightMedium,
      color: theme.palette.text.secondary,
    },
    '& tbody': {
      fontSize: 14,
      lineHeight: 1.5,
      color: theme.palette.text.primary,
    },
    '& td': {
      borderBottom: `1px solid ${theme.palette.divider}`,
      padding: `${theme.spacing.unit}px ${2 * theme.spacing.unit}px ${
        theme.spacing.unit
      }px ${theme.spacing.unit}px`,
      textAlign: 'left',
    },
    '& td:last-child': {
      paddingRight: 3 * theme.spacing.unit,
    },
    '& td compact': {
      paddingRight: 3 * theme.spacing.unit,
    },
    '& td code': {
      fontSize: 13,
      lineHeight: 1.6,
    },
    '& th': {
      whiteSpace: 'pre',
      borderBottom: `1px solid ${theme.palette.divider}`,
      fontWeight: theme.typography.fontWeightMedium,
      padding: `0 ${theme.spacing.unit * 2}px 0 ${theme.spacing.unit}px`,
      textAlign: 'left',
    },
    '& th:last-child': {
      paddingRight: 3 * theme.spacing.unit,
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
      backgroundColor: theme.palette.background.paper,
      padding: `${theme.spacing.unit / 2}px ${3 * theme.spacing.unit}px`,
      margin: `${3 * theme.spacing.unit}px 0`,
    },
    '& a, & a code': {
      // Style taken from the Link component
      color: theme.palette.error.contrastText,
    },
    '& img': {
      maxWidth: '100%',
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
