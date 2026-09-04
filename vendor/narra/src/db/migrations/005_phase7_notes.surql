-- Phase 7: Notes for freeform worldbuilding content
-- Notes can be standalone or attached to any entity

DEFINE TABLE note SCHEMAFULL TYPE NORMAL;
DEFINE FIELD title ON note TYPE string;
DEFINE FIELD body ON note TYPE string;
DEFINE FIELD created_at ON note TYPE datetime VALUE time::now() READONLY;
DEFINE FIELD updated_at ON note TYPE datetime VALUE time::now();
DEFINE INDEX idx_note_title ON note FIELDS title;

-- FULLTEXT search indexes for notes (Phase 7 search integration)
-- Uses same analyzer pattern as Phase 4 for consistency
DEFINE ANALYZER note_analyzer TOKENIZERS class FILTERS ascii, lowercase, snowball(english);
DEFINE INDEX idx_note_search_title ON note FIELDS title FULLTEXT ANALYZER note_analyzer BM25;
DEFINE INDEX idx_note_search_body ON note FIELDS body FULLTEXT ANALYZER note_analyzer BM25;

-- Note attachment edge (note -> any entity)
-- Uses union type to allow attachment to all entity types
DEFINE TABLE note_attachment SCHEMAFULL TYPE RELATION IN note OUT character|location|event|scene|knowledge ENFORCED;
DEFINE FIELD attached_at ON note_attachment TYPE datetime VALUE time::now() READONLY;
