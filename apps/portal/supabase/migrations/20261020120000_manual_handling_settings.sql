create table manual_handling_settings (
    id integer primary key default 1,
    warning_threshold_kg numeric,
    constraint manual_handling_settings_singleton check (id = 1),
    constraint manual_handling_threshold_is_positive_finite check (
        warning_threshold_kg is null or
        (warning_threshold_kg > 0 and warning_threshold_kg < 'Infinity'::numeric)
    )
);

-- An operational manager chooses the site's advisory threshold.
insert into manual_handling_settings (id, warning_threshold_kg) values (1, null);

-- All access goes through the Portal API, including role authorisation.
alter table public.manual_handling_settings enable row level security;
revoke all privileges on table public.manual_handling_settings from anon, authenticated;
