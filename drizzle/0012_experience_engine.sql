-- Experience Engine MVP: provenance for editorial curation and the reverse
-- lookup used by public experience landing pages.

ALTER TABLE place_attribute
  MODIFY COLUMN source ENUM(
    'import',
    'field_visit',
    'owner',
    'user',
    'instagram',
    'inferred',
    'editorial'
  ) NOT NULL DEFAULT 'inferred',
  ALGORITHM=INPLACE,
  LOCK=NONE;

CREATE INDEX place_attribute_discovery_idx
  ON place_attribute (attribute_id, value, place_id);
