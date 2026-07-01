-- 安全強化（Supabase advisor: function_search_path_mutable，WARN）：
-- 為函式固定 search_path，避免呼叫端竄改 search_path 影響函式內未限定名稱的解析（SECURITY DEFINER 尤其重要）。
-- 設為 public：pg_catalog 仍隱式優先搜尋（內建函式照常），public 供未限定的表/函式解析，且不含 pg_temp（防暫存表遮蔽）。
alter function public.set_updated_at() set search_path = public;
alter function public.increment_material_import(p_id uuid) set search_path = public;
alter function public.get_contribution_score(p_owner uuid) set search_path = public;
alter function public.toggle_material_favorite(p_owner uuid, p_id uuid) set search_path = public;
alter function public.increment_contribution_bonus(p_owner uuid, p_n integer) set search_path = public;
alter function public.top_contributors(p_limit integer) set search_path = public;
alter function public.list_evergreen_due(p_default_days integer, p_limit integer) set search_path = public;
alter function public.bump_redirect_click(p_code text) set search_path = public;
alter function public.bump_redirect_continue(p_code text) set search_path = public;
