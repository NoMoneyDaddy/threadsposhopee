-- 每位使用者可自選 AI 文案使用的 Gemini 模型（NULL＝沿用全站預設 GEMINI_MODEL）。
-- 非機密、明文存。允許值由應用層白名單（src/lib/ai-models.ts）把關。
alter table profiles add column if not exists gemini_model text;
