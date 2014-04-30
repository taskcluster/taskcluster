//
// Register schemas and retrieve previously-registered schemas.
//

var uri = require('./uri.js')
  ;


// Schemas for which we have our own bundled copy. These will be
// registered automatically.
var EMBEDDED_SCHEMAS = {
  'http://json-schema.org/draft-04/schema#':
    require('./suites/draft-04/json-schema-draft-v4.json')
};


// ******************************************************************
// Constructor
// ******************************************************************
var SchemaRegistry = function() {
  this._schemas = {};
  this._missingSchemas = {};

  // register embedded schemas
  var keys = Object.keys(EMBEDDED_SCHEMAS);
  keys.forEach(function(key) { this.register(EMBEDDED_SCHEMAS[key]); }, this);
};


// ******************************************************************
// [static] Decode an escaped JSON pointer
// ******************************************************************
SchemaRegistry._decodeJsonPointer = function(pointer) {
  var result = pointer.replace(/\~1/g, '/');
  return result.replace(/\~0/g, '~');
};


// ******************************************************************
// [static] Given a schema and a JSON pointer, return the
// corresponding sub-schema referenced by the JSON pointer.
// ******************************************************************
SchemaRegistry._resolveJsonPointer = function(schema, jp) {
  if (jp === '#') {
    return schema;
  }

  if (jp.slice(0, 2) !== '#/') {
    // not a JSON pointer fragment
    // (may be a valid id ref, but that’s not our problem here)
    return null;
  }

  var path = jp.slice(2).split('/');
  var currentSchema = schema;
  while (path.length) {
    var element = SchemaRegistry._decodeJsonPointer(path.shift());
    if (!Object.prototype.hasOwnProperty.call(currentSchema, element)) {
      return null;
    }
    currentSchema = currentSchema[element];
  }

  return currentSchema;
};


// ******************************************************************
// [static] Normalize schema ids so they can be looked up.
// ******************************************************************
SchemaRegistry._normalizeId = function(id) {
  // for internal use we add the '#' (empty fragment) if missing
  if (id.indexOf('#') === -1) { return id + '#'; }
  return id;
};


// ******************************************************************
// Return boolean indicating whether the specified schema id has
// previously been registered.
// ******************************************************************
SchemaRegistry.prototype.isRegistered = function(id) {
  if (!id) { return false; }
  id = SchemaRegistry._normalizeId(id);
  if (this._schemas.hasOwnProperty(id)) { return true; }
  var uriObj = uri.parse(id);
  return this._schemas.hasOwnProperty(uriObj.baseUri);
};


// ******************************************************************
// [static] Helper to descend into an object, recursively gathering
// all $refs values from the given object and its sub-objects.
// ******************************************************************
SchemaRegistry._gatherRefs = function(obj) {
  var result = [];

  var currentObj = obj;
  var subObjects = [];

  do {

    if (Object.prototype.hasOwnProperty.call(currentObj, '$ref')) {
      result.push(currentObj.$ref);
    }

    var keys = Object.keys(currentObj);
    for (var index = 0, len = keys.length; index !== len; ++index) {
      var prop = currentObj[keys[index]];
      if (typeof prop === 'object') { subObjects.push(prop); }
    }

    currentObj = subObjects.pop();

  } while(currentObj);

  return result;
};


// ******************************************************************
// [static] Helper to descend into an object, recursively gathering
// all sub-objects that contain an id property.
//
// Returns an array where each element is an array of the form:
//
// [ schema, resolutionScope ]
// ******************************************************************
SchemaRegistry._getSubObjectsHavingIds = function(obj, resolutionScope) {
  var result = [];

  resolutionScope = resolutionScope || '#';
  var currentObj = obj;
  var subObjects = [];
  var nextItem;

  do {

    if (Object.prototype.hasOwnProperty.call(currentObj, 'id') &&
        typeof currentObj.id === 'string')
    {
      result.push([currentObj, resolutionScope]);
      resolutionScope = uri.resolve(resolutionScope, currentObj.id);
    }

    var keys = Object.keys(currentObj);
    for (var index = 0, len = keys.length; index !== len; ++index) {
      var prop = currentObj[keys[index]];
      if (typeof prop === 'object') {
        subObjects.push([prop, resolutionScope + '/' + keys[index]]);
      }
    }

    nextItem = subObjects.pop();
    if (nextItem) {
      currentObj = nextItem[0];
      resolutionScope = nextItem[1];
    }
  } while(nextItem);

  return result;
};


// ******************************************************************
// Return currently-unregistered schemas $referenced by the given
// schema.
// ******************************************************************
SchemaRegistry.prototype._missingRefsForSchema = function(schema) {
  var allRefs = SchemaRegistry._gatherRefs(schema);
  var missingRefs = [];

  allRefs.forEach(function(ref) {
    if (ref[0] !== '#') {
      var uriObj = uri.parse(ref);
      if (!this.isRegistered(uriObj.baseUri)) {
        missingRefs.push(uriObj.baseUri);
      }
    }
  }, this);

  return missingRefs;
};


// ******************************************************************
// Register a schema (internal implementation)
// ******************************************************************
SchemaRegistry.prototype._registerImpl = function(schema, id, _resolutionScope)
{
  // sanity check
  if (typeof schema !== 'object' || Array.isArray(schema)) { return []; }

  if (id) {
    var resolvedId = uri.resolve(_resolutionScope || id, id);
    if (this.isRegistered(resolvedId)) { return; }

    var uriObj = uri.parse(resolvedId);
    if (!uriObj.baseUri) { return; }

    this._schemas[resolvedId] = schema;
   }
};

// ******************************************************************
// Register a schema (public interface)
// ******************************************************************
SchemaRegistry.prototype.register = function(schema, id) {
  id = id || schema.id;
  this._registerImpl(schema, id);

  // register any id'd sub-objects
  var toRegister = SchemaRegistry._getSubObjectsHavingIds(schema, id);
  toRegister.forEach(function(item) {
    this._registerImpl(item[0], item[0].id, item[1]);
  }, this);

  // save any missing refs to support the getMissingSchemas method
  var missing = this._missingRefsForSchema(schema);
  missing.forEach(function(item) {
    this._missingSchemas[item] = true;
  }, this);

  return missing;
};

// ******************************************************************
// Get an array of $refs for which we don’t have a schema yet.
// ******************************************************************
SchemaRegistry.prototype.getMissingSchemas = function() {
  var result = Object.keys(this._missingSchemas);
  result = result.filter(function(item) {
    return !this.isRegistered(item);
  }, this);
  return result;
};

// ******************************************************************
// Retrieve a previously-registered schema.
// ******************************************************************
SchemaRegistry.prototype.get = function(id) {

  id = SchemaRegistry._normalizeId(id);

  if (this.isRegistered(id)) {
    return this._schemas[id];
  }

  var uriObj = uri.parse(id);

  if (uriObj.fragment.slice(0, 2) === '#/') {
      return SchemaRegistry._resolveJsonPointer(
      this._schemas[uriObj.baseUri + '#'],
      uriObj.fragment
    );
  }
};

module.exports = SchemaRegistry;
