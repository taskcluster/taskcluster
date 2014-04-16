$(function() {
  $('.signin').click(function(){
    navigator.id.get(function(assertion) {
      if (assertion) {
        $('#persona-assertion').val(assertion);
        $('#persona-form').submit();
      } else {
        location.reload();
      }
    });
  });
});