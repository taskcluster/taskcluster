import React, { Component } from 'react';
import classNames from 'classnames';
import { withStyles } from '@material-ui/core/styles';
import { string, oneOf } from 'prop-types';
import { paramCase } from 'param-case';
import Typography from '@material-ui/core/Typography';

// Helper function to extract text content from React children
const getTextFromChildren = children => {
  if (typeof children === 'string') {
    return children;
  }

  if (Array.isArray(children)) {
    return children.map(getTextFromChildren).join('');
  }

  if (React.isValidElement(children) && children.props.children) {
    return getTextFromChildren(children.props.children);
  }

  return '';
};

@withStyles(theme => ({
  header: {
    color: theme.palette.text.primary,
    marginTop: theme.spacing(4),
    '&:first-child': {
      marginTop: 0,
    },
    '& .anchor-link-style': {
      opacity: 0,
      // To prevent the link to get the focus.
      display: 'none',
    },
    '&:hover .anchor-link-style': {
      display: 'inline-block',
      opacity: 1,
      padding: `0 ${theme.spacing(1)}px`,
      color: theme.palette.text.hint,
      '&:hover': {
        color: theme.palette.text.primary,
      },
    },
    '& code': {
      fontSize: 'inherit',
      lineHeight: 'inherit',
      // Remove scroll on small screens.
      wordBreak: 'break-word',
    },
  },
}))
/**
 * Returns a title with a section anchor.
 */
export default class HeaderWithAnchor extends Component {
  static propTypes = {
    /** Header type. */
    type: oneOf(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']),
    /**
     * Optional id to use for the anchor.
     * If `id` is not supplied, then the title will be used.
     * */
    id: string,
  };

  static defaultProps = {
    type: 'h1',
    id: null,
  };

  getVariantFromType = type => {
    switch (type) {
      case 'h1':
        return 'h4';
      case 'h2':
        return 'h5';
      case 'h3':
        return 'h6';
      default:
        return 'subtitle2';
    }
  };

  render() {
    const { classes, type, children, id, className, ...props } = this.props;
    const variant = this.getVariantFromType(type);
    const textContent = getTextFromChildren(children);
    const anchorId = id || paramCase(textContent);

    return (
      <Typography
        gutterBottom
        id={anchorId}
        component={type}
        variant={variant}
        className={classNames(classes.header, className)}
        {...props}>
        {children}
        <span>&nbsp;</span>
        <a className="anchor-link-style" href={`#${anchorId}`}>
          #
        </a>
      </Typography>
    );
  }
}
