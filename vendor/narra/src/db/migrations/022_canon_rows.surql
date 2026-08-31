-- 第 3 期：scene 带本场钟；情状/知情以行和边为准。JSON 袋只作回退。

DEFINE FIELD IF NOT EXISTS clock_from ON scene TYPE option<int>;
DEFINE FIELD IF NOT EXISTS clock_to ON scene TYPE option<int>;
DEFINE FIELD IF NOT EXISTS cause_beat ON scene TYPE option<record<setting_beat>>;
DEFINE INDEX IF NOT EXISTS idx_scene_clock ON scene FIELDS clock_from, clock_to;
