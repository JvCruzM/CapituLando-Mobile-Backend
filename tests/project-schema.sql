-- CapituLando
-- Migration 001: schema inicial
-- PostgreSQL / Supabase
CREATE TABLE
    users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        email VARCHAR(320) NOT NULL,
        password_hash VARCHAR(100) NOT NULL,
        email_verified BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now ()
    );

CREATE UNIQUE INDEX users_email_lower_uidx ON users (LOWER(email));

CREATE TABLE
    profiles (
        id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
        username VARCHAR(50) NOT NULL,
        display_name VARCHAR(100) NOT NULL,
        bio TEXT,
        avatar_image TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now (),
        CONSTRAINT profiles_username_key UNIQUE (username)
    );

CREATE UNIQUE INDEX profiles_username_lower_uidx ON profiles (LOWER(username));

CREATE TABLE
    stories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        profile_id UUID NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
        title VARCHAR(150) NOT NULL,
        synopsis TEXT,
        description TEXT,
        genre VARCHAR(100),
        status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
        cover_image TEXT,
        progress_percentage INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now (),
        CONSTRAINT stories_status_check CHECK (status IN ('DRAFT', 'IN_PROGRESS', 'COMPLETED')),
        CONSTRAINT stories_progress_percentage_check CHECK (progress_percentage BETWEEN 0 AND 100)
    );

CREATE INDEX stories_profile_id_idx ON stories (profile_id);

CREATE TABLE
    races (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        story_id UUID NOT NULL REFERENCES stories (id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        appearance TEXT,
        culture TEXT,
        habitat TEXT,
        race_image TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now (),
        CONSTRAINT races_story_id_id_key UNIQUE (story_id, id)
    );

CREATE TABLE
    characters (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        story_id UUID NOT NULL REFERENCES stories (id) ON DELETE CASCADE,
        race_id UUID,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        appearance TEXT,
        personality TEXT,
        age INTEGER,
        gender VARCHAR(50),
        background TEXT,
        character_image TEXT,
        role VARCHAR(50),
        mbti VARCHAR(8),
        motivation TEXT,
        notes TEXT,
        birth_date DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now (),
        CONSTRAINT characters_age_check CHECK (
            age IS NULL
            OR age >= 0
        ),
        CONSTRAINT characters_story_id_id_key UNIQUE (story_id, id),
        CONSTRAINT characters_story_race_fkey FOREIGN KEY (story_id, race_id) REFERENCES races (story_id, id) ON DELETE NO ACTION
    );

CREATE INDEX characters_story_id_idx ON characters (story_id);

CREATE INDEX characters_race_id_idx ON characters (race_id);

CREATE TABLE
    creatures (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        story_id UUID NOT NULL REFERENCES stories (id) ON DELETE CASCADE,
        race_id UUID,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        appearance TEXT,
        behavior TEXT,
        habitat TEXT,
        creature_image TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now (),
        CONSTRAINT creatures_story_race_fkey FOREIGN KEY (story_id, race_id) REFERENCES races (story_id, id) ON DELETE NO ACTION
    );

CREATE INDEX creatures_story_id_idx ON creatures (story_id);

CREATE INDEX creatures_race_id_idx ON creatures (race_id);

CREATE TABLE
    items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        story_id UUID NOT NULL REFERENCES stories (id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        type VARCHAR(50),
        description TEXT,
        appearance TEXT,
        origin TEXT,
        item_image TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now ()
    );

CREATE INDEX items_story_id_idx ON items (story_id);

CREATE TABLE
    locations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        story_id UUID NOT NULL REFERENCES stories (id) ON DELETE CASCADE,
        parent_location_id UUID,
        name VARCHAR(150) NOT NULL,
        type VARCHAR(80),
        description TEXT,
        climate VARCHAR(100),
        region VARCHAR(100),
        location_image TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now (),
        CONSTRAINT locations_story_id_id_key UNIQUE (story_id, id),
        CONSTRAINT locations_story_parent_fkey FOREIGN KEY (story_id, parent_location_id) REFERENCES locations (story_id, id) ON DELETE NO ACTION
    );

CREATE INDEX locations_story_id_idx ON locations (story_id);

CREATE INDEX locations_story_parent_idx ON locations (story_id, parent_location_id);

CREATE TABLE
    organizations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        story_id UUID NOT NULL REFERENCES stories (id) ON DELETE CASCADE,
        headquarters_location_id UUID,
        name VARCHAR(150) NOT NULL,
        type VARCHAR(100),
        description TEXT,
        organization_image TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now (),
        CONSTRAINT organizations_story_id_id_key UNIQUE (story_id, id),
        CONSTRAINT organizations_story_headquarters_fkey FOREIGN KEY (story_id, headquarters_location_id) REFERENCES locations (story_id, id) ON DELETE NO ACTION
    );

CREATE INDEX organizations_story_id_idx ON organizations (story_id);

CREATE INDEX organizations_story_headquarters_idx ON organizations (story_id, headquarters_location_id);

CREATE TABLE
    character_organizations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        story_id UUID NOT NULL REFERENCES stories (id) ON DELETE CASCADE,
        character_id UUID NOT NULL,
        organization_id UUID NOT NULL,
        role VARCHAR(100),
        joined_at VARCHAR(100),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now (),
        CONSTRAINT uq_character_organization UNIQUE (character_id, organization_id),
        CONSTRAINT character_org_story_character_fkey FOREIGN KEY (story_id, character_id) REFERENCES characters (story_id, id) ON DELETE NO ACTION,
        CONSTRAINT character_org_story_organization_fkey FOREIGN KEY (story_id, organization_id) REFERENCES organizations (story_id, id) ON DELETE NO ACTION
    );

CREATE INDEX character_org_story_character_idx ON character_organizations (story_id, character_id);

CREATE INDEX character_org_story_organization_idx ON character_organizations (story_id, organization_id);

CREATE TABLE
    chapters (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        story_id UUID NOT NULL REFERENCES stories (id) ON DELETE CASCADE,
        order_index INTEGER NOT NULL,
        title VARCHAR(200) NOT NULL,
        content TEXT,
        word_count INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
        published_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now (),
        CONSTRAINT chapters_status_check CHECK (
            status IN ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED')
        ),
        CONSTRAINT uq_story_chapter_order UNIQUE (story_id, order_index),
        CONSTRAINT chapters_story_id_id_key UNIQUE (story_id, id)
    );

CREATE INDEX chapters_story_id_idx ON chapters (story_id);

CREATE TABLE
    events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        story_id UUID NOT NULL REFERENCES stories (id) ON DELETE CASCADE,
        chapter_id UUID,
        location_id UUID,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        chronological_date VARCHAR(100),
        sequence_order INTEGER,
        event_image TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now (),
        CONSTRAINT events_story_id_id_key UNIQUE (story_id, id),
        CONSTRAINT events_story_chapter_fkey FOREIGN KEY (story_id, chapter_id) REFERENCES chapters (story_id, id) ON DELETE NO ACTION,
        CONSTRAINT events_story_location_fkey FOREIGN KEY (story_id, location_id) REFERENCES locations (story_id, id) ON DELETE NO ACTION
    );

CREATE INDEX events_story_id_idx ON events (story_id);

CREATE INDEX events_story_chapter_idx ON events (story_id, chapter_id);

CREATE INDEX events_story_location_idx ON events (story_id, location_id);
-- CapituLando
-- Migration 002: authentication and writer features
-- PostgreSQL / Supabase
CREATE TABLE
    auth_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        token_hash VARCHAR(64) NOT NULL,
        purpose VARCHAR(30) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now (),
        CONSTRAINT auth_tokens_token_hash_key UNIQUE (token_hash)
    );

CREATE INDEX auth_tokens_user_purpose_idx ON auth_tokens (user_id, purpose);

CREATE INDEX auth_tokens_expires_at_idx ON auth_tokens (expires_at);

CREATE TABLE
    character_relationships (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        story_id UUID NOT NULL REFERENCES stories (id) ON DELETE CASCADE,
        source_character_id UUID NOT NULL,
        target_character_id UUID NOT NULL,
        relationship_type VARCHAR(80) NOT NULL,
        level INTEGER NOT NULL DEFAULT 3,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now (),
        CONSTRAINT uq_character_relationship_source_target_type UNIQUE (
            source_character_id,
            target_character_id,
            relationship_type
        ),
        CONSTRAINT character_relationship_source_story_fkey FOREIGN KEY (story_id, source_character_id) REFERENCES characters (story_id, id) ON DELETE NO ACTION,
        CONSTRAINT character_relationship_target_story_fkey FOREIGN KEY (story_id, target_character_id) REFERENCES characters (story_id, id) ON DELETE NO ACTION
    );

CREATE INDEX character_relationships_story_id_idx ON character_relationships (story_id);

CREATE TABLE
    event_characters (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        story_id UUID NOT NULL REFERENCES stories (id) ON DELETE CASCADE,
        event_id UUID NOT NULL,
        character_id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now (),
        CONSTRAINT uq_event_character UNIQUE (event_id, character_id),
        CONSTRAINT event_character_event_story_fkey FOREIGN KEY (story_id, event_id) REFERENCES events (story_id, id) ON DELETE NO ACTION,
        CONSTRAINT event_character_character_story_fkey FOREIGN KEY (story_id, character_id) REFERENCES characters (story_id, id) ON DELETE NO ACTION
    );

CREATE INDEX event_characters_story_id_idx ON event_characters (story_id);

CREATE TABLE
    goals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        profile_id UUID NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
        story_id UUID REFERENCES stories (id) ON DELETE SET NULL,
        title VARCHAR(180) NOT NULL,
        description TEXT,
        unit VARCHAR(50) NOT NULL,
        current_value INTEGER NOT NULL DEFAULT 0,
        target_value INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now (),
        CONSTRAINT goals_values_check CHECK (
            current_value >= 0
            AND target_value > 0
        )
    );

CREATE INDEX goals_profile_id_idx ON goals (profile_id);

CREATE INDEX goals_story_id_idx ON goals (story_id);

CREATE TABLE
    ideas (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        profile_id UUID NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
        story_id UUID REFERENCES stories (id) ON DELETE SET NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now ()
    );

CREATE INDEX ideas_profile_id_idx ON ideas (profile_id);

CREATE INDEX ideas_story_id_idx ON ideas (story_id);

CREATE TABLE
    world_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        story_id UUID NOT NULL REFERENCES stories (id) ON DELETE CASCADE,
        title VARCHAR(150) NOT NULL,
        category VARCHAR(80) NOT NULL,
        description TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now ()
    );

CREATE INDEX world_rules_story_id_idx ON world_rules (story_id);
ALTER TABLE users
ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE users ADD CONSTRAINT users_token_version_nonnegative CHECK (token_version >= 0);
ALTER TABLE characters
ADD COLUMN height VARCHAR(30),
ADD COLUMN weight VARCHAR(30),
ADD COLUMN zodiac VARCHAR(30),
ADD COLUMN blood_type VARCHAR(10),
ADD COLUMN image_fit VARCHAR(12),
ADD COLUMN image_position VARCHAR(30),
ADD COLUMN likes TEXT,
ADD COLUMN dislikes TEXT,
ADD COLUMN drinks TEXT,
ADD COLUMN motto TEXT;

ALTER TABLE character_relationships
ADD COLUMN description TEXT;
CREATE TABLE workspace_sections (
    id VARCHAR(255) PRIMARY KEY,
    content TEXT NOT NULL,
    revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0)
);

ALTER TABLE users
    ALTER COLUMN password_hash TYPE VARCHAR(255);

-- Compartilhado pelo Spring e pela API mobile.
-- O cadastro publico sempre usa AUTHOR; ADMIN exige atribuicao administrativa.
ALTER TABLE users
    ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'AUTHOR',
    ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE,
    ADD CONSTRAINT users_role_check CHECK (role IN ('AUTHOR', 'ADMIN'));

-- Uma linha representa uma sessao de login e a familia dos seus refresh tokens.
CREATE TABLE refresh_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_version INTEGER NOT NULL,
    user_agent TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    CONSTRAINT refresh_sessions_token_version_check CHECK (token_version >= 0),
    CONSTRAINT refresh_sessions_expiry_check CHECK (expires_at > created_at)
);

CREATE INDEX refresh_sessions_user_id_idx ON refresh_sessions(user_id);
CREATE INDEX refresh_sessions_expires_at_idx ON refresh_sessions(expires_at);

-- Tokens antigos permanecem registrados para detectar reutilizacao apos rotacao.
-- Armazene SHA-256 hexadecimal do token opaco, nunca o token em texto puro.
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES refresh_sessions(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    replaced_by_id UUID,
    CONSTRAINT refresh_tokens_hash_key UNIQUE (token_hash),
    CONSTRAINT refresh_tokens_session_id_id_key UNIQUE (session_id, id),
    CONSTRAINT refresh_tokens_hash_check CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT refresh_tokens_expiry_check CHECK (expires_at > created_at),
    CONSTRAINT refresh_tokens_replacement_check CHECK (
        replaced_by_id IS NULL OR (replaced_by_id <> id AND consumed_at IS NOT NULL)
    ),
    CONSTRAINT refresh_tokens_replacement_fkey
        FOREIGN KEY (session_id, replaced_by_id)
        REFERENCES refresh_tokens(session_id, id)
);

CREATE INDEX refresh_tokens_expires_at_idx ON refresh_tokens(expires_at);

ALTER TABLE chapters
    ADD COLUMN revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0);
