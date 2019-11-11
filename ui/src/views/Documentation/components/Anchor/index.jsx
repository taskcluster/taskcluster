import React from 'react';
import { Link } from 'react-router-dom';
import { string, node } from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import resolve from 'resolve-pathname';

const styles = theme => ({
  link: {
    ...theme.mixins.link,
  },
});
// Ref: https://material-ui.com/guides/composition/#caveat-with-refs
// eslint-disable-next-line react/display-name
const Anchor = React.forwardRef(
  ({ classes, href, children, ...props }, ref) => {
    if (href.startsWith('http')) {
      return (
        <a
          className={classes.link}
          href={href}
          {...props}
          target="_blank"
          rel="noopener noreferrer"
          ref={ref}>
          {children}
        </a>
      );
    }

    const url = resolve(href, window.location.pathname);

    return (
      <Link className={classes.link} to={url} ref={ref} {...props}>
        {children}
      </Link>
    );
  }
);

Anchor.propTypes = {
  href: string.isRequired,
  children: node.isRequired,
};

export default withStyles(styles)(Anchor);
