CREATE TABLE cloud_media_jobs (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES cloud_accounts(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  input_name text NOT NULL,
  input_mime text NOT NULL,
  input_size bigint NOT NULL DEFAULT 0 CHECK (input_size >= 0),
  input_ready boolean NOT NULL DEFAULT false,
  language text CHECK (language IN ('zh', 'en', 'ja', 'ko')),
  detected_language text,
  duration double precision,
  result_json jsonb,
  error_code text,
  error_message text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX cloud_media_jobs_account_active_idx
  ON cloud_media_jobs(account_id)
  WHERE status IN ('queued', 'running');

CREATE INDEX cloud_media_jobs_queue_idx
  ON cloud_media_jobs(created_at)
  WHERE status = 'queued' AND input_ready = true;

CREATE INDEX cloud_media_jobs_expiry_idx ON cloud_media_jobs(expires_at);
