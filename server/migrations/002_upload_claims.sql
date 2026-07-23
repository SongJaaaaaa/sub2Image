ALTER TABLE cloud_uploads DROP CONSTRAINT cloud_uploads_status_check;

ALTER TABLE cloud_uploads
  ADD CONSTRAINT cloud_uploads_status_check
  CHECK (status IN ('pending', 'uploading', 'uploaded', 'completing', 'complete'));

ALTER TABLE cloud_uploads
  ADD COLUMN claim_id uuid,
  ADD COLUMN claim_expires_at timestamptz,
  ADD COLUMN final_object_key text;

CREATE INDEX cloud_uploads_expiry_idx
  ON cloud_uploads(updated_at)
  WHERE status <> 'complete';

CREATE INDEX cloud_uploads_final_object_idx
  ON cloud_uploads(final_object_key)
  WHERE final_object_key IS NOT NULL;
