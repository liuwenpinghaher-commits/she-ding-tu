-- 设定图正史双写进官方 Narra 表。load_canon 场骨架读带 setting_beat 的 scene；无该指针的官方 scene 不当正史。

DEFINE FIELD IF NOT EXISTS clock_from ON event TYPE option<int>;
DEFINE FIELD IF NOT EXISTS clock_to ON event TYPE option<int>;
DEFINE INDEX IF NOT EXISTS idx_event_clock ON event FIELDS clock_from, clock_to;

DEFINE FIELD IF NOT EXISTS status ON scene TYPE option<string>;
DEFINE FIELD IF NOT EXISTS commit_seq ON scene TYPE option<int>;
DEFINE FIELD IF NOT EXISTS kind ON scene TYPE option<string>;
DEFINE FIELD IF NOT EXISTS intent ON scene TYPE option<string>;
DEFINE FIELD IF NOT EXISTS value_shift ON scene TYPE option<string>;
DEFINE FIELD IF NOT EXISTS do_text ON scene TYPE option<string>;
DEFINE FIELD IF NOT EXISTS say_text ON scene TYPE option<string>;
DEFINE FIELD IF NOT EXISTS think_text ON scene TYPE option<string>;
DEFINE FIELD IF NOT EXISTS telling_ord ON scene TYPE option<int>;
DEFINE FIELD IF NOT EXISTS visible_to ON scene TYPE option<array<string>>;
DEFINE FIELD IF NOT EXISTS setting_beat ON scene TYPE option<record<setting_beat>>;
DEFINE INDEX IF NOT EXISTS idx_scene_status ON scene FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_scene_seq ON scene FIELDS commit_seq;

-- 省略场可以稍后才标地。覆盖 002/008 的必填 record<location>。
DEFINE FIELD OVERWRITE primary_location ON scene TYPE option<record<location>>
    REFERENCE ON DELETE REJECT ;

DEFINE FIELD IF NOT EXISTS scene ON knows TYPE option<record<scene>>;
DEFINE FIELD IF NOT EXISTS clock_from ON knows TYPE option<int>;
DEFINE FIELD IF NOT EXISTS commit_seq ON knows TYPE option<int>;
