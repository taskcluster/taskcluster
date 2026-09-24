import React, { Component } from 'react';
import classNames from 'classnames';
import { oneOf, bool, string } from 'prop-types';
import purple from '@material-ui/core/colors/purple';
import { withStyles } from '@material-ui/core/styles';
import Label from '../Label';
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
     * The state to display, e.g. a task state (`completed`) or a run
     * reason (`worker-shutdown`). Case and dashes are normalized.
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
    // the queue reports states and reasons in kebab case (`worker-shutdown`)
    const label = state ? state.toUpperCase().replace(/-/g, '_') : 'UNKNOWN';

    return (
      <Label
        mini={mini}
        status={variant || labels[label] || 'default'}
        className={classNames(
          {
            [classes.pending]: label === 'PENDING',
          },
          className
        )}
        {...props}>
        {label}
      </Label>
    );
  }
}
