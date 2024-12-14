begin

    DROP FUNCTION IF EXISTS upsert_audit_history(text, text, text, jsonb);
    DROP TABLE audit_history;

end
