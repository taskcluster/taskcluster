import { Component } from 'react';
import MuiSpeedDialAction from '@material-ui/lab/SpeedDialAction';
import { bool } from 'prop-types';
import { withAuth } from '../../utils/Auth';

@withAuth
/**
 * A Material UI button augmented with application specific props.
 */
export default class Button extends Component {
  static propTypes = {
    /** If true, the button will be disabled if the user is not authenticated */
    requiresAuth: bool,
  };

  static defaultProps = {
    requiresAuth: false,
  };

  render() {
    const { requiresAuth, ButtonProps, user, ...props } = this.props;
    const disabled = requiresAuth && !user;
    const buttonProps = {
      ...ButtonProps,
      ...(disabled ? { disabled: true } : {}),
    };

    return <MuiSpeedDialAction ButtonProps={buttonProps} {...props} />;
  }
}
