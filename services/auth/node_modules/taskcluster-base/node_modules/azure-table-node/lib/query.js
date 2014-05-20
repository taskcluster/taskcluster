'use strict';

var utils = require('./utils');
var _ = require('lodash');

var Query = {
  _query: null,

  create: function create(key, comparison, value) {
    var obj = Object.create(this, {
      _query: {value: this._query ? this._query : '', writable: true}
    });
    if (key && comparison && value) {
      obj.where(key, comparison, value);
    }
    return obj;
  },

  _addFilter: function _addFilter(key, comparison, value) {
    this._query += key;
    switch (comparison) {
      case '==':
      case '=': // support single too
        this._query += ' eq ';
        break;
      case '!=':
        this._query += ' ne ';
        break;
      case '>':
        this._query += ' gt ';
        break;
      case '<':
        this._query += ' lt ';
        break;
      case '>=':
        this._query += ' ge ';
        break;
      case '<=':
        this._query += ' le ';
        break;
      default:
        throw 'Invalid comparison';
    }

    if (typeof value === 'string') {
      if (value.length === 36 && utils.isGuid(value)) {
        this._query += 'guid\''+value+'\'';
      } else {
        this._query += '\''+value.replace(/'/g, '\'\'')+'\'';
      }
    } else if (typeof value === 'number' || _.isBoolean(value)) {
      this._query += ''+value; // convert to string
      if (value % 1 === 0 && Math.abs(value) >= 2147483648) { // add L for int64
        this._query += 'L';
      }
    } else if (_.isDate(value)) {
      this._query += 'datetime\''+value.toISOString()+'\'';
    } else { // to be on a safe side, convert anything else to string
      this._query += '\''+value.toString().replace(/'/g, '\'\'')+'\'';
    }
  },

  where: function where(key, comparison, value) {
    if (this._query.length > 0) {
      throw 'where() can be used only as first filter';
    }
    this._addFilter(key, comparison, value);
    return this;
  },

  and: function and(key, comparison, value) {
    if (this._query.length === 0) {
      throw 'and() cannot be used as first filter';
    }
    if (this._query.lastIndexOf('not ') === this._query.length - 4) {
      this._query = this._query.substr(0, this._query.length - 4);
      this._query += ' and not ';
    } else {
      this._query += ' and ';
    }

    this._addFilter(key, comparison, value);
    return this;
  },

  or: function or(key, comparison, value) {
    if (this._query.length === 0) {
      throw 'or() cannot be used as first filter';
    }
    if (this._query.lastIndexOf('not ') === this._query.length - 4) {
      this._query = this._query.substr(0, this._query.length - 4);
      this._query += ' or not ';
    } else {
      this._query += ' or ';
    }
    this._addFilter(key, comparison, value);
    return this;
  },

  not: function not() {
    this._query += 'not ';
    return this;
  }
};

exports.Query = Query;