-- The pick packer records the packing result from the Visualiser after an
-- order is finalised: PACKED (Done) or INCOMPLETE (Cancel). NULL means no
-- result has been recorded yet.
alter table orders
    add column packing_status text,
    add column packing_updated_at timestamptz;

alter table orders
    add constraint orders_packing_status_is_valid
        check (packing_status is null or packing_status in ('PACKED', 'INCOMPLETE')),
    add constraint orders_only_finalised_are_packed
        check (packing_status is null or status = 'FINAL'),
    add constraint orders_packing_status_has_time
        check ((packing_status is null) = (packing_updated_at is null));
