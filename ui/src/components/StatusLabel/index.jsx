import React, { Component } from 'react';
import classNames from 'classnames';
import { oneOf, bool, string } from 'prop-types';
import Label from '@mozilla-frontend-infra/components/Label';
import purple from '@material-ui/core/colors/purple';
import { withStyles } from '@material-ui/core/styles';
import labels from '../../utils/labels';

@withStyles(theme => ({
  pending: {
    backgroundColor: `${purple[400]} !important`,
    color: `${theme.palette.getContrastText(purple[400])} !important`,
  },
}))
/**
 * A label color-coded based on known statuses from GraphQL responses.
 */
export default class StatusLabel extends Component {
  static defaultProps = {
    mini: true,
    className: null,
    variant: null,
  };

  static propTypes = {
    /**
     * A GraphQL status/state string.
     */
    state: string.isRequired,
    /**
     * Render the label using dense styling.
     */
    mini: bool,
    /** The CSS class name of the wrapper element */
    className: string,
    /**
     * The label color. Only use this if you are looking to override
     * the color that's already derived from the state prop.
     * */
    variant: oneOf(['default', 'info', 'success', 'error', 'warning']),
  };

  render() {
    const { classes, variant, state, mini, className, ...props } = this.props;

    return (
      <Label
        mini={mini}
        status={variant || labels[state] || 'default'}
        className={classNames(
          {
            [classes.pending]: state === 'PENDING',
          },
          className
        )}
        {...props}>
        {state || 'UNKNOWN'}
      </Label>
    );
  }
}
