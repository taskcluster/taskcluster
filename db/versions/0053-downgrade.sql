begin
  revoke select, insert, update, delete on objects from $db_user_prefix$_object;
  drop table objects;
end

