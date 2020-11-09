begin
    alter table objects drop column backend_id;
    alter table objects drop column project_id;
end
