begin

    REVOKE select, insert, update, delete ON audit_history FROM $db_user_prefix$_auth;
    REVOKE select, insert, update, delete ON audit_history FROM $db_user_prefix$_hooks;
    REVOKE select, insert, update, delete ON audit_history FROM $db_user_prefix$_secrets;
    DROP TABLE audit_history;

end
