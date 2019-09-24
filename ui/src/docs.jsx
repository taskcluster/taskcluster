import React from 'react';
import { render } from 'react-dom';
import App from './App';
import routes from './App/docsRoutes';
import Link from './utils/Link';

Link.setRoutes(routes);

render(<App routes={routes} />, document.getElementById('root'));
