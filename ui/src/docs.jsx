import React from 'react';
import { render } from 'react-dom';
import App from './App';
import routes from './App/docsRoutes';

render(<App routes={routes} />, document.getElementById('root'));
