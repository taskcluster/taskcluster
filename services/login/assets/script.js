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

  $('#ldap-modal').on('shown.bs.modal', function() {
    $('#ldap-modal input[name="username"]').focus();
  });

  $('#manual-form').submit(function(e) {
    e.preventDefault();
    showCredentials({
      clientId: $('#manual-modal input[name="clientId"]').val().trim(),
      accessToken: $('#manual-modal input[name="accessToken"]').val().trim(),
      certificate: $('#manual-modal textarea[name="certificate"]').val().trim(),
    });
    $('#manual-modal').modal('hide');
  });

  $('#manual-modal').on('shown.bs.modal', function() {
    $('#manual-modal input[name="clientId"]').focus();
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
if (typeof(query.target) === 'string' && /^http/.test(query.target) &&
    typeof(query.description) === 'string') {
  var a = document.createElement('a');
  a.href = query.target;
  if (a.protocol === 'https:' || a.hostname === 'localhost') {
    localStorage.setItem('grant-request', JSON.stringify({
      target: query.target,
      description: query.description
    }));
    // Get rid of those ugly query-strings...
    window.location = '/';
  } else {
    console.log("target " + query.target + " isn't valid, http only allowed " +
                "for localhost");
  }
}

// Check if we can naively redirect to a host
function isAllowedHost(host) {
  if (window.allowedHosts.indexOf(host) !== -1) {
    return true;
  }
  try {
    var hosts = JSON.parse(localStorage.getItem('allowed-hosts') || '[]');
    return hosts.indexOf(host) !== -1;
  } catch(err) {
    console.log("Ignore JSON.parse errors... (probably invalid value)");
  }
  return false;
}

// Store a host as have been approved, so we don't have to approve it again.
function setAllowedHost(host) {
  var hosts = [];
  try {
    hosts = JSON.parse(localStorage.getItem('allowed-hosts') || '[]');
  } catch(err) {
    console.log("Ignore JSON.parse errors... (probably invalid value)");
  }
  if (!(hosts instanceof Array)) {
    hosts = [];
  }
  if (hosts.indexOf(host) !== -1) {
    hosts.push(host);
    localStorage.setItem('allowed-hosts', JSON.stringify(hosts));
  }
}

// Show the grant section, given a querystring-stringified version
// of the credentials to display
function showGrant(credentials) {
  // Get query from localStorage
  var query = null;
  try {
    var value = localStorage.getItem('grant-request');
    if (value === null) {
      return;
    }
    query = JSON.parse(value);
    if (typeof(query.target) !== 'string' || query.target.length === 0 ||
        typeof(query.description) !== 'string') {
      return;
    }
  } catch (err) {
    console.log("Ignoring JSON.parse errors... (probably invalid value)");
    return;
  }

  // Render description and display it
  $('#grant-description').html(marked(query.description , {
    sanitize: true,
    gfm: true,
    tables: true,
    breaks: true
  }));

  // Create url for redirecting to target
  var querystring = [];
  querystring.push('clientId=' + encodeURIComponent(credentials.clientId));
  querystring.push('accessToken=' + encodeURIComponent(credentials.accessToken));
  if (credentials.certificate) {
    var cert = credentials.certificate;
    if (typeof cert !== 'string') {
      cert = JSON.stringify(cert);
    }
    querystring.push('certificate=' + encodeURIComponent(cert));
  }
  querystring = querystring.join('&');
  var redirectTarget = query.target + '?' + querystring;
  // Use the grant-button as cheap url parser
  $('#grant-button').attr('href', redirectTarget);
  $('.grant-target').text(query.target);
  var hostname = $('#grant-button')[0].hostname;
  // Do the actual redirect
  var gotoRedirectTarget = function() {
    // Remove the request from localStorage
    localStorage.removeItem('grant-request');
    // Remember in localStorage that the host has been approved
    setAllowedHost(hostname);
    // redirect to target...
    window.location = redirectTarget;
  };

  // Set hostname
  $('.grant-hostname').text(hostname);

  // Prepare dialog
  $('#hostname-input').bind(
    'propertychange change click keyup input paste', function() {
      // update disabled state of button on any change...
      if ($('#hostname-input').val().trim() === hostname) {
        $('#confirm-grant-button').removeClass('disabled');
      } else {
        $('#confirm-grant-button').addClass('disabled');
      }
  });
  // If grant button is clicked check if we should redirect...
  $('#confirm-grant-button').click(function() {
    if ($('#hostname-input').val().trim() === hostname) {
      gotoRedirectTarget();
    }
  });
  // If someone hits enter we'll take that as clicking the button too...
  $('#hostname-input').keyup(function(e) {
    if (e.keyCode == 13) {
      if ($('#hostname-input').val().trim() === hostname) {
        gotoRedirectTarget();
      }
    }
  });
  // When someone hits the big grant button...
  $('#grant-button').click(function(e) {
    e.preventDefault();
    // check if host is allowed... and proceed if it is...
    if (!isAllowedHost(hostname)) {
      // Reset and show dialog
      $('#hostname-input').val('');
      $('#approve-dialog').modal('show');
      $('#hostname-input').focus();
    } else {
      // Redirect now...
      gotoRedirectTarget();
    }
  });

  $('#grant-area').show();
  $('#confirm-grant-button').focus();
};

// Show the credentials section
function showCredentials(credentials) {
  if (localStorage.getItem('grant-request')) {
    showGrant(credentials);
  }

  // Set target url and credentials... and show the grant area...
  $('#credentials-clientId').text(credentials.clientId);
  $('#credentials-accessToken').text(credentials.accessToken);
  if (credentials.certificate) {
    $('#credentials-certificate').text(credentials.certificate);
  } else {
    $('#credentials-certificate').text('');
  }
  $('#credentials-display').show();
};
