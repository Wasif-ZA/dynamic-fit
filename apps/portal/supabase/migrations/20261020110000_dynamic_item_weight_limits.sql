-- The supported maximum depends on current inventory and is checked by the API.
-- Keep historical orders readable when inventory changes.
alter table order_items drop constraint order_items_weight_within_limits;
alter table order_items add constraint order_items_weight_is_positive_finite
    check (weight > 0 and weight < 'Infinity'::numeric);
