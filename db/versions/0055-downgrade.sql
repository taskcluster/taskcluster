begin
    alter table objects drop column backend_id text;
    alter table objects drop column project_id text;
end
