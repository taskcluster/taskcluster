$(function() {
  $('#persona-form').submit(function(e) {
    if (!$('#persona-assertion').val()) {
      e.preventDefault();
      navigator.id.get(function(assertion) {
        if (assertion) {
          $('#persona-assertion').val(assertion);
          $('#persona-form').submit();
        } else {
          location.reload();
        }
      });
    }
  });
});

jQuery.extend({
  getQueryString: function() {
    var parts = (document.location.search || '')
                .replace(/(^\?)/,'').split(/=|&/g);
    var result = {};
    for(var i = 0; i < parts.length - 1; i += 2) {
      result[decodeURIComponent(parts[i])] = decodeURIComponent(parts[i + 1]);
    }
    return result;
  }
});

// Okay, this isn't pretty... But we have to store the stuff we got from the
// query string in local storage, as we grant carry the query string with us
// through all the login steps (particular SSO)
// Due to size we don't even try to store in a cookie, which would have the same
// result, basically that authenticating in two windows of the same browser
// in parallel would cause issues... But why would people do that???
var query = $.getQueryString();
if (typeof(query.target) === 'string' &&
    typeof(query.description) === 'string') {
  localStorage.setItem('grant-request', JSON.stringify({
    target: query.target,
    description: query.description
  }));
  // Get rid of those ugly query-strings...
  window.location = '/';
}

function load(credentials) {
  var query = null;
  try {
    var value = localStorage.getItem('grant-request');
    if (value === null) {
      return;
    }
    query = JSON.parse(value);
    if (typeof(query.target) !== 'string' ||
        typeof(query.description) !== 'string') {
      return;
    }
  } catch (err) {
    console.log("Ignoring JSON.parse errors... (probably invalid value)");
    return;
  }
  $('#grant-description').html(marked(query.description , {
    sanitize: true,
    gfm: true,
    tables: true,
    breaks: true
  }));
  $('#grant-button').attr('href', query.target + '?' + credentials);
  $('#grant-button').click(function() {
    localStorage.removeItem('grant-request');
  });
  $('.grant-target').text(query.target);
  $('#grant-area').show();
};