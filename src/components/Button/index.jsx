import { Component } from 'react';
import MuiButton from '@material-ui/core/Button';
import { node, bool } from 'prop-types';
import { withAuth } from '../../utils/Auth';

@withAuth
/**
 * A Material UI button augmented with application specific props.
 */
export default class Button extends Component {
  static propTypes = {
    /** The content of the button. */
    children: node.isRequired,
    /** If true, the button will be disabled if the user is not authenticated */
    requiresAuth: bool,
  };

  static defaultProps = {
    requiresAuth: false,
  };

  render() {
    const { children, requiresAuth, disabled, user, ...props } = this.props;
    const isDisabled = (requiresAuth && !user) || disabled;

    return (
      <MuiButton disabled={isDisabled} {...props}>
        {children}
      </MuiButton>
    );
  }
}
