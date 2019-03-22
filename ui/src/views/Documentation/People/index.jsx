import React, { Component } from 'react';
import { withStyles } from '@material-ui/core/styles';
import { func } from 'prop-types';
import { withRouter } from 'react-router-dom';
import { contributors } from '../../../../../.all-contributorsrc';

@withRouter
@withStyles(() => ({
  peopleList: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    alignItems: 'top',
  },
  anchor: {
    textDecoration: 'none',
  },
  person: {
    padding: '5px',
    margin: '5px',
    textAlign: 'center',
    minWidth: '200px',
  },
  photoFrame: {
    width: '100px',
    height: '100px',
    margin: 'auto',
  },
  photoImage: {
    borderRadius: '100%',
    backgroundClip: 'padding-box',
    border: '3px solid white',
    boxShadow: '0px 0px 5px rgba(2,2,2,0.2)',
    width: '100px',
    height: '100px',
    boxSizing: 'border-box',
  },
}))
export default class People extends Component {
  static propTypes = {
    filter: func,
  };

  render() {
    const { classes, filter } = this.props;

    return (
      <div className={classes.peopleList}>
        {contributors.filter(filter || (() => true)).map(contrib => (
          <div key={contrib.login} className={classes.person}>
            <div className={classes.photoFrame}>
              <a className={classes.anchor} href={contrib.profile || '#'}>
                <img
                  alt="avatar"
                  className={classes.photoImage}
                  src={contrib.avatar_url}
                />
              </a>
            </div>
            <a className={classes.anchor} href={contrib.profile || '#'}>
              {contrib.name || contrib.login}
            </a>
          </div>
        ))}
      </div>
    );
  }
}
