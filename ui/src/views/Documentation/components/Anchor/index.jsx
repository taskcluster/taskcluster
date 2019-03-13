import React from 'react';
import { Link } from 'react-router-dom';
import { string, node } from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import resolve from 'resolve-pathname';

const useStyles = withStyles(theme => ({
  link: {
    '&, & code': {
      ...theme.mixins.link,
    },
  },
}));

function Anchor({ classes, href, children, ...props }) {
  if (href.startsWith('http')) {
    return (
      <a
        className={classes.link}
        href={href}
        {...props}
        target="_blank"
        rel="noopener noreferrer">
        {children}
      </a>
    );
  }

  const url = resolve(href, window.location.pathname);

  return (
    <Link className={classes.link} to={url} {...props}>
      {children}
    </Link>
  );
}

Anchor.propTypes = {
  href: string.isRequired,
  children: node.isRequired,
};

export default useStyles(Anchor);
