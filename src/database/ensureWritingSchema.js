export async function ensureWritingSchema(pool) {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS stories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(120) NOT NULL,
      title VARCHAR(255) NOT NULL,
      genre VARCHAR(100) DEFAULT 'Geral',
      description TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chapters (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
      user_id VARCHAR(120) NOT NULL,
      title VARCHAR(255) NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      word_count INTEGER NOT NULL DEFAULT 0,
      kind VARCHAR(20) NOT NULL DEFAULT 'chapter' CHECK (kind IN ('chapter', 'draft')),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE chapters ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'chapter';
    ALTER TABLE chapters ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE chapters ADD COLUMN IF NOT EXISTS word_count INTEGER NOT NULL DEFAULT 0;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chapter_versions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      title VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      kind VARCHAR(20) NOT NULL,
      session_id VARCHAR(120),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS writing_space_state (
      user_id VARCHAR(120) NOT NULL,
      story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
      chapter_id UUID REFERENCES chapters(id) ON DELETE SET NULL,
      kind VARCHAR(20) NOT NULL DEFAULT 'chapter' CHECK (kind IN ('chapter', 'draft')),
      title VARCHAR(255) NOT NULL DEFAULT 'Novo Capítulo',
      content TEXT NOT NULL DEFAULT '',
      session_id VARCHAR(120),
      version INTEGER NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (user_id, story_id)
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_chapters_user_story ON chapters(user_id, story_id);
    CREATE INDEX IF NOT EXISTS idx_chapter_versions_chapter ON chapter_versions(chapter_id);
  `);
}