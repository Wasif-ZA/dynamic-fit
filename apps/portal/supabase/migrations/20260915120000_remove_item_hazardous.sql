-- The client's item schema has no Hazardous field. BoxGroup (box_group) is the
-- client-defined packing constraint, so the Portal's hazardous flag is removed.
-- Any stored hazardous values are discarded.
alter table order_items drop column hazardous;
