begin
  return query select secrets.name as name, secrets.expires as expires from secrets;
end
