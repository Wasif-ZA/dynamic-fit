alter table public.portal_users enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.box_types enable row level security;
alter table public.solutions enable row level security;

revoke all privileges on table
    public.portal_users,
    public.orders,
    public.order_items,
    public.box_types,
    public.solutions
from anon, authenticated;

revoke all privileges on sequence
    public.order_id_sequence,
    public.order_reference_sequence,
    public.order_items_id_seq,
    public.box_types_sort_key_seq
from anon, authenticated;

alter default privileges in schema public
    revoke all privileges on tables from anon, authenticated;

alter default privileges in schema public
    revoke all privileges on sequences from anon, authenticated;
