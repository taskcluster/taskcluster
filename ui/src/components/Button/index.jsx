import React, { Component } from 'react';
import MuiButton from '@material-ui/core/Button';
import Fab from '@material-ui/core/Fab';
import Tooltip from '@material-ui/core/Tooltip';
import { object, node, bool, oneOf, string } from 'prop-types';
import { withAuth } from '../../utils/Auth';

@withAuth
/**
 * A Material UI button augmented with application specific props.
 */
export default class Button extends Component {
  static defaultProps = {
    requiresAuth: false,
    variant: 'text',
    tooltip: null,
    spanProps: null,
    id: null,
  };

  static propTypes = {
    /** The content of the button. */
    children: node.isRequired,
    /** If true, the button will be disabled if the user is not authenticated */
    requiresAuth: bool,
    /** The variant to use. */
    variant: oneOf(['text', 'outlined', 'contained', 'circular', 'extended']),
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
    id: string,
  };

  render() {
    const {
      children,
      requiresAuth,
      disabled,
      user,
      variant,
      onClick,
      onAuthorize,
      onUnauthorize,
      tooltipProps,
      spanProps,
      id,
      ...props
    } = this.props;
    const lackingAuth = requiresAuth && !user;
    const isDisabled = lackingAuth || disabled;
    const MuiComponent =
      variant === 'circular' || variant === 'extended' ? Fab : MuiButton;
    const ButtonComponent = (
      <MuiComponent
        onClick={onClick}
        disabled={isDisabled}
        variant={variant}
        id={id}
        {...props}>
        {children}
      </MuiComponent>
    );
    const tooltipTitle = tooltipProps?.title;

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
