import React, { Component } from 'react';
import { string } from 'prop-types';
import { Helmet as ReactHelmet } from 'react-helmet';
import { lowerCase } from 'change-case';
import { taskGroupState } from '../../utils/prop-types';

export default class Helmet extends Component {
  static propTypes = {
    /**
     * The state of the task group.
     * Leave this value undefined outside the Task Group view.
     */
    state: taskGroupState,
    /** The document title */
    title: string,
  };

  static defaultProps = {
    state: null,
    title: null,
  };

  render() {
    const { state, title } = this.props;

    return (
      <ReactHelmet>
        {state ? (
          <link
            href={`/src/images/logo${lowerCase(state)}.png`}
            rel="shortcut icon"
          />
        ) : (
          <link href="/src/images/logo.png" rel="shortcut icon" />
        )}
        {title && <title>{title}</title>}
      </ReactHelmet>
    );
  }
}
