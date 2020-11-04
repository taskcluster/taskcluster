begin
  create table objects (
    name text not null,
    data jsonb not null
  );
  grant select, insert, update, delete on objects to $db_user_prefix$_object;
end
