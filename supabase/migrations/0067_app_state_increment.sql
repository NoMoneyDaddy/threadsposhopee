-- 原子累加 app_state 內以文字儲存的整數計數器（如 sponsor:total:<accId>）。
-- 取代應用層「讀-加-寫」：單次 upsert 完成累加，消除併發覆寫/漂移，且省一次 SELECT roundtrip。
-- 首次插入以 p_delta 為初值；回傳累加後新值。
create or replace function increment_app_state_int(p_key text, p_delta integer default 1)
returns integer language plpgsql set search_path = public as $$
declare
  new_val integer;
begin
  insert into app_state (key, value, updated_at)
  values (p_key, p_delta::text, now())
  on conflict (key) do update
    set value = (coalesce(nullif(app_state.value, '')::integer, 0) + p_delta)::text,
        updated_at = now()
  returning nullif(value, '')::integer into new_val;
  return new_val;
end;
$$;
