import Enzyme, { shallow, render, mount } from 'enzyme';
import EnzymeAdapter from 'enzyme-adapter-react-16';

// Setup enzyme's react adapter
Enzyme.configure({ adapter: new EnzymeAdapter() });

// Make Enzyme functions available in all test files without importing
Object.assign(global, {
  shallow,
  render,
  mount,
});
