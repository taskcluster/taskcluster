import { createElement } from 'react';
import { shape, func } from 'prop-types';
import { Route } from 'react-router-dom';

const PropsRoute = ({ component, render, ...props }) => (
  <Route
    {...props}
    render={routeProps => createElement(component, { ...routeProps, ...props })}
  />
);

PropsRoute.propTypes = {
  component: func.isRequired,
  props: shape({}),
  render: func
};

PropsRoute.defaultProps = {
  props: null,
  render: null
};

export default PropsRoute;
