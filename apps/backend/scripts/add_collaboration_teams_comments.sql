-- Teams, access, invitations, and comments (P1/P2)

-- Teams
CREATE TABLE IF NOT EXISTS teams (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	name text NOT NULL,
	owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_members (
	team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
	user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	role text NOT NULL CHECK (role IN ('owner','admin','member')),
	created_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT team_members_pkey PRIMARY KEY (team_id, user_id)
);

-- Deck access (team and user)
CREATE TABLE IF NOT EXISTS deck_team_access (
	deck_id uuid NOT NULL REFERENCES decks(uuid) ON DELETE CASCADE,
	team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
	role text NOT NULL CHECK (role IN ('viewer','editor','commenter')),
	created_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT deck_team_access_pkey PRIMARY KEY (deck_id, team_id)
);

CREATE TABLE IF NOT EXISTS deck_user_access (
	deck_id uuid NOT NULL REFERENCES decks(uuid) ON DELETE CASCADE,
	user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	role text NOT NULL CHECK (role IN ('viewer','editor','commenter')),
	invited_by_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
	invited_at timestamptz NULL,
	status text NOT NULL DEFAULT 'active' CHECK (status IN ('invited','active','revoked')),
	permissions jsonb NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT deck_user_access_pkey PRIMARY KEY (deck_id, user_id)
);

-- Invitations
CREATE TABLE IF NOT EXISTS invitations (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	type text NOT NULL CHECK (type IN ('team','deck')),
	email text NOT NULL,
	role text NULL,
	token text UNIQUE NOT NULL,
	team_id uuid NULL REFERENCES teams(id) ON DELETE CASCADE,
	deck_id uuid NULL REFERENCES decks(uuid) ON DELETE CASCADE,
	invited_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	expires_at timestamptz NULL,
	accepted_by_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
	accepted_at timestamptz NULL,
	created_at timestamptz NOT NULL DEFAULT now()
);

-- Comments
CREATE TABLE IF NOT EXISTS comments (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	deck_id uuid NOT NULL REFERENCES decks(uuid) ON DELETE CASCADE,
	slide_id uuid NULL,
	slide_key text NULL,
	author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	body text NOT NULL,
	thread_id uuid NULL,
	resolved_by_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
	resolved_at timestamptz NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_deck_user_access_deck_user ON deck_user_access(deck_id, user_id);
CREATE INDEX IF NOT EXISTS idx_deck_team_access_deck_team ON deck_team_access(deck_id, team_id);
CREATE INDEX IF NOT EXISTS idx_comments_deck ON comments(deck_id);
CREATE INDEX IF NOT EXISTS idx_comments_slide ON comments(slide_id);
CREATE INDEX IF NOT EXISTS idx_comments_slide_key ON comments(slide_key);

-- Note: RLS policies should be added in DB with owner/admin controls; skipping here.
