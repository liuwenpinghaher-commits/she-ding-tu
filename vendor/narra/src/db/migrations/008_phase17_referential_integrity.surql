-- Narra Phase 17 Schema Extension
-- Referential Integrity: CASCADE and REJECT constraints using REFERENCE clause

-- ==============================================================================
-- CASCADE DELETIONS FOR OWNED DATA
-- When a parent entity is deleted, its owned children are automatically deleted
-- ==============================================================================

-- Knowledge owned by character: Delete knowledge when character deleted
DEFINE FIELD character ON knowledge TYPE record<character>
    REFERENCE ON DELETE CASCADE ;

-- Relation endpoints are constrained by TYPE RELATION … ENFORCED, not REFERENCE
-- on in/out. Edge rows cascade when the referenced records are deleted.

-- Scene owned by event: Delete scene when event deleted
DEFINE FIELD event ON scene TYPE record<event>
    REFERENCE ON DELETE CASCADE ;

-- ==============================================================================
-- REJECT DELETIONS FOR PROTECTED ENTITIES
-- Prevent deletion of entities that are referenced in historical records
-- ==============================================================================

-- Cannot delete location if it's a primary location of any scene
DEFINE FIELD primary_location ON scene TYPE record<location>
    REFERENCE ON DELETE REJECT ;

-- Cannot delete location if it's the parent of other locations
DEFINE FIELD parent ON location TYPE option<record<location>>
    REFERENCE ON DELETE REJECT ;

-- ==============================================================================
-- UNSET FOR OPTIONAL ARRAYS
-- Remove deleted entity from arrays without deleting referencing record
-- ==============================================================================

-- Remove deleted location from scene.secondary_locations arrays
DEFINE FIELD secondary_locations ON scene TYPE array<record<location>>
    REFERENCE ON DELETE UNSET ;

-- ==============================================================================
-- Reverse-query indexes (built in the schema script; not CONCURRENTLY)
-- ==============================================================================

-- Enable reverse queries: "What knowledge belongs to this character?"
DEFINE INDEX idx_knowledge_character_ref ON knowledge FIELDS character;

-- Enable reverse queries: "What scenes does this character participate in?"
DEFINE INDEX idx_participates_character ON participates_in FIELDS in;
