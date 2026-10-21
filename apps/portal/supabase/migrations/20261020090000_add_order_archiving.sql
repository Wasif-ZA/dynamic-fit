-- Hold, archive and finalisation timestamps are independent of lifecycle
-- status. Existing items, saved solutions and inventory history are unchanged.
alter table orders
    add column archived_at timestamptz,
    add column held_at timestamptz,
    add column finalised_at timestamptz;

-- Older finalised orders have no finalisation timestamp. Start their retention
-- period now rather than treating their creation date as their completion date.
update orders set finalised_at = current_timestamp where status = 'FINAL';

alter table orders
    add constraint orders_only_finalised_are_archived
        check (archived_at is null or status = 'FINAL'),
    add constraint orders_only_unfinished_are_held
        check (held_at is null or status <> 'FINAL');

create index orders_pending_archive_idx on orders (finalised_at)
where status = 'FINAL' and archived_at is null;
