import React, { PureComponent } from 'react';
import { string } from 'prop-types';
import { withStyles } from '@material-ui/core/styles';

@withStyles(theme => ({
  // Not all images sit nicely on a dark theme (e..g, images with dark text)
  imageWrapper: {
    textAlign: 'center',
    background: theme.palette.type === 'dark' ? '#ffffffcc' : 'none',
  },
}))
export default class Image extends PureComponent {
  static propTypes = {
    /** Image source */
    src: string.isRequired,
  };

  render() {
    const { classes, src, ...props } = this.props;
    const startsWithHttp = src.startsWith('http');

    // Some local images have black text making them hard to see
    // when viewing the page with the dark theme
    return startsWithHttp ? (
      // biome-ignore lint/a11y/useAltText: alt is provided by the caller through {...props}
      <img src={src} {...props} />
    ) : (
      <div className={classes.imageWrapper}>
        {/* biome-ignore lint/a11y/useAltText: alt is provided by the caller through {...props} */}
        <img src={src} {...props} />
      </div>
    );
  }
}
