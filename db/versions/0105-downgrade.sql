begin

      REVOKE select, insert, update, delete ON audit_history FROM $db_user_prefix$_auth;
    DROP TABLE audit_history;

end
