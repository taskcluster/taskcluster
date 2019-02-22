import React, { Fragment, Component } from 'react';
import { string, oneOf } from 'prop-types';
import { paramCase } from 'change-case';
import Typography from '@material-ui/core/Typography';

/** Returns a title with a section anchor. */
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
    const { type, children, id, ...props } = this.props;
    const variant = this.getVariantFromType(type);
    const anchorId = id || paramCase(children);

    return (
      <Fragment>
        <Typography id={anchorId} component={type} variant={variant} {...props}>
          {children}
          <span>&nbsp;</span>
          <a className="anchor-link-style" href={`#${anchorId}`}>
            #
          </a>
        </Typography>
      </Fragment>
    );
  }
}
