import { lazy } from 'react';

export default (factory) => {
  const Component = lazy(factory);

  Component.preload = factory;

  return Component;
};
