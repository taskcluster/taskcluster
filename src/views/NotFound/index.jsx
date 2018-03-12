import { Component } from 'react';
import { object } from 'prop-types';

export default class NotFound extends Component {
  static propTypes = {
    location: object.isRequired
  };

  render() {
    const ex = Object.assign(
      new Error(
        `The requested route ${this.props.location.pathname} was not found.`
      ),
      {
        response: {
          status: 404
        }
      }
    );

    return <div>{ex.toString()}</div>;
  }
}
