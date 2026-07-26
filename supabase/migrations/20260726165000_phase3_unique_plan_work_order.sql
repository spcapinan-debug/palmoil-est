begin;

-- A planned item may create at most one work order. The partial index keeps
-- direct work orders (planned_work_item_id is null) unchanged.
create unique index if not exists uq_work_orders_planned_work_item_id
  on public.work_orders (planned_work_item_id)
  where planned_work_item_id is not null;

commit;
