begin
    alter table objects add column backend_id text not null default '';
    alter table objects add column project_id text not null default '';
end
