-- R2-D 拆表＋重綁：把 per-account 贊助「持久狀態」從 app_state 搬到專屬表，主鍵改為穩定的 threads_user_id。
-- 動機：舊鍵以內部 uuid（threads_accounts.id）為鍵，使用者「刪帳號→重加同一 Threads 帳號」會拿到新 uuid，
--       等於洗掉黑名單/違規罰則/累積贊助歷史（永久搭便車＋規避裁罰）。改綁穩定的 threads_user_id 即杜絕。
-- 範圍：只搬「持久且與身分綁定」的狀態（累積數/轉出數/黑名單/罰則/禁用/自選）。
--       每日紀錄 sponsor:rec:*（時序、已有保留期清理、非防濫用關鍵）與 owner 欠抽 sponsor:redebt:*（以 owner 為鍵）仍留 app_state。
-- 相容：保留舊 app_state 鍵不刪（避免「先套 migration、後部署程式」的空窗；新程式只讀寫本表，舊鍵自然停更）。

create table if not exists sponsor_account_stats (
  threads_user_id text primary key,
  sponsored_count integer not null default 0,      -- 累積贊助數（原 sponsor:total:<accId>）
  redist_count    integer not null default 0,      -- 已轉出份額（原 sponsor:redist:<accId>）
  blocked         boolean not null default false,  -- 管理員黑名單（原 sponsor:blocked:<accId>）
  penalty_factor  numeric,                          -- 違規加重倍數（原 sponsor:penalty.factor）
  penalty_until   timestamptz,                      -- 加重到期（原 sponsor:penalty.until）
  optout          jsonb,                            -- 臨時/永久禁用 {until,mode,permanent}（原 sponsor:optout）
  pick            jsonb,                            -- 使用者自選贊助文 {draftId,hour}（原 sponsor:pick）
  updated_at      timestamptz not null default now()
);

-- 原子 upsert-increment：一次累加 sponsored/redist，回傳新 sponsored_count（消除讀-改-寫併發漂移，單次 roundtrip）。
create or replace function bump_sponsor_stat(p_tuid text, p_sponsored integer default 0, p_redist integer default 0)
returns integer language plpgsql set search_path = public as $$
declare
  new_val integer;
begin
  insert into sponsor_account_stats (threads_user_id, sponsored_count, redist_count, updated_at)
  values (p_tuid, greatest(p_sponsored, 0), greatest(p_redist, 0), now())
  on conflict (threads_user_id) do update
    set sponsored_count = sponsor_account_stats.sponsored_count + p_sponsored,
        redist_count    = sponsor_account_stats.redist_count + p_redist,
        updated_at      = now()
  returning sponsored_count into new_val;
  return new_val;
end;
$$;

-- ── 回填：把既有 app_state 鍵依 threads_accounts 對應到 threads_user_id 搬入本表（冪等；重跑安全）──
-- 累積數/轉出數：同一 tuid 可能對到多個歷史 accId（極少見），取最大值彙總。
insert into sponsor_account_stats (threads_user_id, sponsored_count)
select ta.threads_user_id, max(coalesce(nullif(s.value, '')::int, 0))
from app_state s join threads_accounts ta on s.key = 'sponsor:total:' || ta.id::text
where s.key like 'sponsor:total:%'
group by ta.threads_user_id
on conflict (threads_user_id) do update set sponsored_count = excluded.sponsored_count, updated_at = now();

insert into sponsor_account_stats (threads_user_id, redist_count)
select ta.threads_user_id, max(coalesce(nullif(s.value, '')::int, 0))
from app_state s join threads_accounts ta on s.key = 'sponsor:redist:' || ta.id::text
where s.key like 'sponsor:redist:%'
group by ta.threads_user_id
on conflict (threads_user_id) do update set redist_count = excluded.redist_count, updated_at = now();

insert into sponsor_account_stats (threads_user_id, blocked)
select ta.threads_user_id, true
from app_state s join threads_accounts ta on s.key = 'sponsor:blocked:' || ta.id::text
where s.key like 'sponsor:blocked:%'
group by ta.threads_user_id
on conflict (threads_user_id) do update set blocked = true, updated_at = now();

-- 罰則/禁用/自選：JSON/字串值，同 tuid 取最近更新者（distinct on 避免同語句內重複命中衝突）。
insert into sponsor_account_stats (threads_user_id, penalty_factor, penalty_until)
select distinct on (ta.threads_user_id) ta.threads_user_id,
       (s.value::jsonb ->> 'factor')::numeric,
       (s.value::jsonb ->> 'until')::timestamptz
from app_state s join threads_accounts ta on s.key = 'sponsor:penalty:' || ta.id::text
where s.key like 'sponsor:penalty:%'
order by ta.threads_user_id, s.updated_at desc
on conflict (threads_user_id) do update set penalty_factor = excluded.penalty_factor, penalty_until = excluded.penalty_until, updated_at = now();

insert into sponsor_account_stats (threads_user_id, optout)
select distinct on (ta.threads_user_id) ta.threads_user_id,
       case when s.value ~ '^\s*\{' then s.value::jsonb
            else jsonb_build_object('until', s.value, 'mode', 'off', 'permanent', false) end
from app_state s join threads_accounts ta on s.key = 'sponsor:optout:' || ta.id::text
where s.key like 'sponsor:optout:%'
order by ta.threads_user_id, s.updated_at desc
on conflict (threads_user_id) do update set optout = excluded.optout, updated_at = now();

insert into sponsor_account_stats (threads_user_id, pick)
select distinct on (ta.threads_user_id) ta.threads_user_id, s.value::jsonb
from app_state s join threads_accounts ta on s.key = 'sponsor:pick:' || ta.id::text
where s.key like 'sponsor:pick:%'
order by ta.threads_user_id, s.updated_at desc
on conflict (threads_user_id) do update set pick = excluded.pick, updated_at = now();
