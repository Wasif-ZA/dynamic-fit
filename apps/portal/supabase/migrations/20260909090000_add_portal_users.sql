create table portal_users (
    id            uuid primary key,
    auth_user_id  uuid not null unique,
    email         text not null unique,
    display_name  text,
    role          text not null,
    status        text not null default 'ACTIVE',
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),

    constraint portal_users_email_not_blank
        check (length(btrim(email)) > 0),
    constraint portal_users_display_name_not_blank
        check (display_name is null or length(btrim(display_name)) > 0),
    constraint portal_users_role_is_valid
        check (role in ('USER', 'SUPERVISOR', 'ADMINISTRATOR')),
    constraint portal_users_status_is_valid
        check (status in ('ACTIVE', 'DISABLED'))
);

create unique index portal_users_email_case_insensitive_idx
    on portal_users (lower(email));

create index portal_users_created_at_idx on portal_users (created_at, id);
