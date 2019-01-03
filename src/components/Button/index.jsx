import React, { Component } from 'react';
import ReactGA from 'react-ga';
import MuiButton from '@material-ui/core/Button';
import Fab from '@material-ui/core/Fab';
import Tooltip from '@material-ui/core/Tooltip';
import { object, node, bool, oneOf } from 'prop-types';
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
    variant: null,
    tooltip: null,
    spanProps: null,
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
    /** The variant to use. */
    variant: oneOf(['text', 'outlined', 'contained', 'round', 'extended']),
    /** Properties applied to the Tooltip component */
    tooltipProps: object,
    /**
     * Properties applied to the span wrapper element
     * This is only applicable when the `tooltipProps` prop is set,
     * otherwise there is no wrapper element.
     * This is useful for positioning the button.
     *
     * Note: We wrap a button with a span in order to
     * be able to show tooltips on disabled buttons.
     * */
    spanProps: object,
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
      variant,
      onClick,
      track,
      onAuthorize,
      onUnauthorize,
      tooltipProps,
      spanProps,
      ...props
    } = this.props;
    const lackingAuth = requiresAuth && !user;
    const isDisabled = lackingAuth || disabled;
    const MuiComponent =
      variant === 'round' || variant === 'extended' ? Fab : MuiButton;
    const ButtonComponent = (
      <MuiComponent
        onClick={this.handleButtonClick}
        disabled={isDisabled}
        variant={variant}
        {...props}>
        {children}
      </MuiComponent>
    );
    const tooltipTitle = tooltipProps && tooltipProps.title;

    return tooltipProps ? (
      <Tooltip
        {...tooltipProps}
        title={lackingAuth ? `${tooltipTitle} (Auth Required)` : tooltipTitle}>
        <span {...spanProps}>{ButtonComponent}</span>
      </Tooltip>
    ) : (
      ButtonComponent
    );
  }
}
