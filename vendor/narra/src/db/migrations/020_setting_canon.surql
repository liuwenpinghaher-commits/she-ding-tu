-- 设定图正史：三时钟、在场边、情状窗口、知情挂场。
-- 草稿不进这些表。status 只有 committed | superseded。

DEFINE TABLE setting_entity SCHEMAFULL;
DEFINE FIELD kind ON setting_entity TYPE string;
DEFINE FIELD name ON setting_entity TYPE string;
DEFINE FIELD profile ON setting_entity TYPE option<string> DEFAULT NONE;
DEFINE FIELD created_at ON setting_entity TYPE datetime VALUE time::now() READONLY;
DEFINE INDEX idx_setting_entity_name ON setting_entity FIELDS name UNIQUE;
DEFINE INDEX idx_setting_entity_kind ON setting_entity FIELDS kind;

DEFINE TABLE setting_column SCHEMAFULL;
DEFINE FIELD clock_from ON setting_column TYPE int;
DEFINE FIELD clock_to ON setting_column TYPE int;
DEFINE FIELD display_ord ON setting_column TYPE int;
DEFINE INDEX idx_setting_column_clock ON setting_column FIELDS clock_from, clock_to;
DEFINE INDEX idx_setting_column_ord ON setting_column FIELDS display_ord;

DEFINE TABLE setting_beat SCHEMAFULL;
DEFINE FIELD kind ON setting_beat TYPE string;
DEFINE FIELD column ON setting_beat TYPE record<setting_column>;
DEFINE FIELD status ON setting_beat TYPE string;
DEFINE FIELD commit_seq ON setting_beat TYPE int;
DEFINE FIELD intent ON setting_beat TYPE string;
DEFINE FIELD value_shift ON setting_beat TYPE option<string>;
DEFINE FIELD do_text ON setting_beat TYPE option<string>;
DEFINE FIELD say_text ON setting_beat TYPE option<string>;
DEFINE FIELD think_text ON setting_beat TYPE option<string>;
DEFINE FIELD clock_from ON setting_beat TYPE int;
DEFINE FIELD clock_to ON setting_beat TYPE int;
DEFINE FIELD place ON setting_beat TYPE option<record<setting_entity>>;
DEFINE FIELD telling_ord ON setting_beat TYPE option<int>;
DEFINE FIELD cause_beat ON setting_beat TYPE option<record<setting_beat>>;
DEFINE FIELD visible_to ON setting_beat TYPE option<array<string>>;
DEFINE FIELD deltas_json ON setting_beat TYPE option<string>;
DEFINE FIELD promise_ops_json ON setting_beat TYPE option<string>;
DEFINE FIELD knowledge_json ON setting_beat TYPE option<string>;
DEFINE FIELD created_at ON setting_beat TYPE datetime VALUE time::now() READONLY;
DEFINE INDEX idx_setting_beat_status ON setting_beat FIELDS status;
DEFINE INDEX idx_setting_beat_seq ON setting_beat FIELDS commit_seq;
DEFINE INDEX idx_setting_beat_clock ON setting_beat FIELDS clock_from, clock_to;
DEFINE INDEX idx_setting_beat_column ON setting_beat FIELDS column;

DEFINE TABLE setting_present_in TYPE RELATION IN setting_entity OUT setting_beat SCHEMAFULL;
DEFINE FIELD role ON setting_present_in TYPE string;
DEFINE FIELD created_at ON setting_present_in TYPE datetime VALUE time::now() READONLY;
DEFINE INDEX idx_setting_present_role ON setting_present_in FIELDS role;
DEFINE INDEX idx_setting_present_in ON setting_present_in FIELDS in;
DEFINE INDEX idx_setting_present_out ON setting_present_in FIELDS out;

DEFINE TABLE setting_window SCHEMAFULL;
DEFINE FIELD entity ON setting_window TYPE record<setting_entity>;
DEFINE FIELD attr ON setting_window TYPE string;
DEFINE FIELD value ON setting_window TYPE string;
DEFINE FIELD clock_from ON setting_window TYPE int;
DEFINE FIELD clock_to ON setting_window TYPE option<int>;
DEFINE FIELD commit_seq ON setting_window TYPE int;
DEFINE FIELD source_beat ON setting_window TYPE record<setting_beat>;
DEFINE INDEX idx_setting_window_entity ON setting_window FIELDS entity, attr, clock_from;
DEFINE INDEX idx_setting_window_seq ON setting_window FIELDS commit_seq;

DEFINE TABLE setting_knows SCHEMAFULL;
DEFINE FIELD person ON setting_knows TYPE record<setting_entity>;
DEFINE FIELD fact ON setting_knows TYPE string;
DEFINE FIELD scene ON setting_knows TYPE record<setting_beat>;
DEFINE FIELD clock_from ON setting_knows TYPE int;
DEFINE FIELD commit_seq ON setting_knows TYPE int;
DEFINE INDEX idx_setting_knows_person ON setting_knows FIELDS person, scene;
DEFINE INDEX idx_setting_knows_clock ON setting_knows FIELDS clock_from;

DEFINE TABLE setting_promise SCHEMAFULL;
DEFINE FIELD name ON setting_promise TYPE string;
DEFINE FIELD status ON setting_promise TYPE string;
DEFINE FIELD related ON setting_promise TYPE array<string> DEFAULT [];
DEFINE FIELD plant_clock ON setting_promise TYPE option<int>;
DEFINE FIELD deadline_clock ON setting_promise TYPE option<int>;
DEFINE FIELD red_herring ON setting_promise TYPE bool DEFAULT false;
DEFINE INDEX idx_setting_promise_name ON setting_promise FIELDS name UNIQUE;
DEFINE INDEX idx_setting_promise_status ON setting_promise FIELDS status;

DEFINE TABLE setting_materialize SCHEMAFULL;
DEFINE FIELD clock_from ON setting_materialize TYPE int;
DEFINE FIELD clock_to ON setting_materialize TYPE int;
DEFINE FIELD as_of ON setting_materialize TYPE option<int>;
DEFINE FIELD payload ON setting_materialize TYPE string;
DEFINE INDEX idx_setting_mat_span ON setting_materialize FIELDS clock_from, clock_to, as_of;
