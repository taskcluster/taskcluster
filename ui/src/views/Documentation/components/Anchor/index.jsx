import React from 'react';
import { Link } from 'react-router-dom';
import { withStyles } from '@material-ui/core/styles';
import resolve from 'resolve-pathname';

const useStyles = withStyles(theme => ({
  link: {
    '&, & code': {
      // Style taken from the Link component
      color: theme.palette.secondary.main,
      textDecoration: 'none',
      '&:hover': {
        textDecoration: 'underline',
      },
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

export default useStyles(Anchor);
