import React, { Component, createContext } from 'react';

export const ToggleThemeContext = createContext(Function.prototype);

export const withThemeToggler = UntoggleableThemeComponent =>
  class ToggleableThemeComponent extends Component {
    render() {
      return (
        <ToggleThemeContext.Consumer>
          {toggleTheme => (
            <UntoggleableThemeComponent
              {...this.props}
              onToggleTheme={toggleTheme}
            />
          )}
        </ToggleThemeContext.Consumer>
      );
    }
  };
