import React, { Component } from 'react';
import ReactGA from 'react-ga';
import MuiButton from '@material-ui/core/Button';
import { node, bool } from 'prop-types';
import { withAuth } from '../../utils/Auth';
import { gaEvent } from '../../utils/prop-types';

const defaultTrack = {
  action: 'Click',
  category: 'Uncategorized',
};

@withAuth
/**
 * A Material UI button augmented with application specific props.
 */
export default class Button extends Component {
  static defaultProps = {
    requiresAuth: false,
    track: null,
  };

  static propTypes = {
    /** The content of the button. */
    children: node.isRequired,
    /** If true, the button will be disabled if the user is not authenticated */
    requiresAuth: bool,
    /** Google Analytics.
     * If defined, the button will send an analytic event to Google
     * */
    track: gaEvent,
  };

  handleButtonClick = () => {
    const { onClick, track } = this.props;

    if (track && process.env.GA_TRACKING_ID) {
      const trackingEvent = { ...defaultTrack, ...track };

      ReactGA.event(trackingEvent);
    }

    if (onClick) {
      onClick();
    }
  };

  render() {
    const {
      children,
      requiresAuth,
      disabled,
      user,
      onClick,
      track,
      ...props
    } = this.props;
    const isDisabled = (requiresAuth && !user) || disabled;

    return (
      <MuiButton
        onClick={this.handleButtonClick}
        disabled={isDisabled}
        {...props}
      >
        {children}
      </MuiButton>
    );
  }
}
