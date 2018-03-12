import { createElement } from 'react';
import { shape, func } from 'prop-types';
import { Route } from 'react-router-dom';

const RouteWithProps = ({ component, render, ...props }) => (
  <Route
    {...props}
    render={routeProps => createElement(component, { ...routeProps, ...props })}
  />
);

RouteWithProps.propTypes = {
  component: func.isRequired,
  props: shape({}),
  render: func
};

RouteWithProps.defaultProps = {
  props: null,
  render: null
};

export default RouteWithProps;
