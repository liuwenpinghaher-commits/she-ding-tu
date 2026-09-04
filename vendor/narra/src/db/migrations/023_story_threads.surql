-- 场上逻辑线归属。不算进算出这一刻。
DEFINE FIELD IF NOT EXISTS story_threads_json ON setting_beat TYPE option<string>;
DEFINE FIELD IF NOT EXISTS tracks_json ON setting_beat TYPE option<string>;
