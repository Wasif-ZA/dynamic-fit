-- MaximumBoxes is the quantity of a box type available to use. The client's
-- schema makes it optional: when omitted there is no quantity limit, stored as
-- NULL. Existing values, including 0, are kept. The existing non-negative check
-- still applies and a NULL passes it.
alter table box_types alter column maximum_boxes drop not null;
alter table box_types alter column maximum_boxes drop default;

-- Solver eligibility is now active AND (maximum_boxes IS NULL OR maximum_boxes > 0).
-- Finalisation subtracts only from boxes with a quantity limit.

-- ItemCode is the client's own identifier, so any non-blank text is accepted.
-- Existing codes already satisfy the new check and are left unchanged.
alter table order_items drop constraint order_items_item_code_is_canonical;

alter table order_items
    add constraint order_items_item_code_not_blank
        check (length(btrim(item_code)) > 0);
