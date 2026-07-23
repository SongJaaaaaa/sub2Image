CREATE TABLE cloud_accounts (
  id uuid PRIMARY KEY,
  provider text NOT NULL CHECK (provider = 'sub2api'),
  external_user_id text NOT NULL,
  email_snapshot text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_user_id)
);

CREATE TABLE cloud_assets (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES cloud_accounts(id) ON DELETE CASCADE,
  sha256 char(64) NOT NULL,
  kind text NOT NULL CHECK (kind IN ('image', 'video')),
  mime_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  object_key text NOT NULL UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, sha256, kind)
);

CREATE TABLE cloud_asset_aliases (
  account_id uuid NOT NULL REFERENCES cloud_accounts(id) ON DELETE CASCADE,
  source_asset_id text NOT NULL,
  asset_id uuid NOT NULL REFERENCES cloud_assets(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, source_asset_id)
);

CREATE INDEX cloud_asset_aliases_asset_idx ON cloud_asset_aliases(asset_id);

CREATE TABLE cloud_uploads (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES cloud_accounts(id) ON DELETE CASCADE,
  source_asset_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('image', 'video')),
  mime_type text NOT NULL,
  expected_size bigint NOT NULL CHECK (expected_size > 0),
  expected_sha256 char(64) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  temp_object_key text,
  uploaded_size bigint,
  uploaded_sha256 char(64),
  status text NOT NULL CONSTRAINT cloud_uploads_status_check
    CHECK (status IN ('pending', 'uploaded', 'complete')),
  asset_id uuid REFERENCES cloud_assets(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, source_asset_id)
);

CREATE INDEX cloud_uploads_account_status_idx ON cloud_uploads(account_id, status);

CREATE TABLE cloud_tasks (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES cloud_accounts(id) ON DELETE CASCADE,
  source_task_id text NOT NULL,
  task_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, source_task_id)
);

CREATE INDEX cloud_tasks_account_updated_idx ON cloud_tasks(account_id, updated_at DESC);

CREATE TABLE cloud_task_assets (
  task_id uuid NOT NULL REFERENCES cloud_tasks(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES cloud_assets(id) ON DELETE RESTRICT,
  source_asset_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('input', 'output', 'mask', 'original', 'video', 'poster', 'thumbnail')),
  position integer NOT NULL CHECK (position >= 0),
  PRIMARY KEY (task_id, role, position)
);

CREATE INDEX cloud_task_assets_asset_idx ON cloud_task_assets(asset_id);

CREATE TABLE cloud_skills (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES cloud_accounts(id) ON DELETE CASCADE,
  source_skill_id text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  file_name text NOT NULL,
  markdown text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, source_skill_id)
);

CREATE INDEX cloud_skills_account_updated_idx ON cloud_skills(account_id, updated_at DESC);

CREATE TABLE cloud_storage_deletions (
  object_key text PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
