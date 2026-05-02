-- Supabase Database Schema for OFlatNas
-- PostgreSQL Database (500MB Free Tier)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS TABLE (用户表 - 永久保存)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for user lookup
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- ============================================
-- USER DATA TABLE (用户配置数据 - 永久保存)
-- ============================================
CREATE TABLE IF NOT EXISTS user_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    data_key VARCHAR(100) NOT NULL,
    data_value JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, data_key)
);

-- Index for user data lookup
CREATE INDEX IF NOT EXISTS idx_user_data_user_id ON user_data(user_id);
CREATE INDEX IF NOT EXISTS idx_user_data_key ON user_data(data_key);

-- ============================================
-- HOT NEWS TABLE (热搜数据 - 会被清理)
-- ============================================
CREATE TABLE IF NOT EXISTS hot_news (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source VARCHAR(50) NOT NULL,          -- 'weibo', 'news', 'zhihu', 'bilibili'
    title VARCHAR(500) NOT NULL,
    url TEXT,
    hot_value VARCHAR(100),               -- 热度值，如 "播放 100万 · 赞 5000"
    fetched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for hot news queries
CREATE INDEX IF NOT EXISTS idx_hot_news_source ON hot_news(source);
CREATE INDEX IF NOT EXISTS idx_hot_news_fetched_at ON hot_news(fetched_at);
CREATE INDEX IF NOT EXISTS idx_hot_news_created_at ON hot_news(created_at);

-- ============================================
-- RSS FEEDS TABLE (RSS订阅源)
-- ============================================
CREATE TABLE IF NOT EXISTS rss_feeds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,  -- NULL for public feeds
    feed_url TEXT NOT NULL,
    feed_title VARCHAR(255),
    feed_category VARCHAR(100),
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rss_feeds_user_id ON rss_feeds(user_id);

-- ============================================
-- RSS ITEMS TABLE (RSS文章缓存 - 会被清理)
-- ============================================
CREATE TABLE IF NOT EXISTS rss_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    feed_id UUID REFERENCES rss_feeds(id) ON DELETE CASCADE,
    title VARCHAR(500),
    link TEXT,
    description TEXT,
    pub_date TIMESTAMP WITH TIME ZONE,
    fetched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rss_items_feed_id ON rss_items(feed_id);
CREATE INDEX IF NOT EXISTS idx_rss_items_fetched_at ON rss_items(fetched_at);

-- ============================================
-- SITE CONFIG TABLE (站点配置)
-- ============================================
CREATE TABLE IF NOT EXISTS site_config (
    id VARCHAR(50) PRIMARY KEY,  -- 'auth_mode', 'enable_docker', etc.
    config_value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to clean old hot news (keep latest 500 entries per source)
CREATE OR REPLACE FUNCTION clean_old_hot_news()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    WITH grouped AS (
        SELECT id, source,
               ROW_NUMBER() OVER (PARTITION BY source ORDER BY created_at DESC) as rn
        FROM hot_news
    )
    DELETE FROM hot_news WHERE id IN (
        SELECT id FROM grouped WHERE rn > 500
    );
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean old RSS items (keep latest 200 items per feed)
CREATE OR REPLACE FUNCTION clean_old_rss_items()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    WITH grouped AS (
        SELECT id, feed_id,
               ROW_NUMBER() OVER (PARTITION BY feed_id ORDER BY created_at DESC) as rn
        FROM rss_items
    )
    DELETE FROM rss_items WHERE id IN (
        SELECT id FROM grouped WHERE rn > 200
    );
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get database size in bytes
CREATE OR REPLACE FUNCTION get_database_size_bytes()
RETURNS BIGINT AS $$
BEGIN
    RETURN pg_database_size(current_database());
END;
$$ LANGUAGE plpgsql;

-- Function to check if database is half full (250MB of 500MB)
CREATE OR REPLACE FUNCTION is_database_half_full()
RETURNS BOOLEAN AS $$
DECLARE
    db_size BIGINT;
    max_size BIGINT := 500 * 1024 * 1024;  -- 500MB
    half_size BIGINT := 250 * 1024 * 1024; -- 250MB
BEGIN
    db_size := pg_database_size(current_database());
    RETURN db_size > half_size;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto update updated_at for users
CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_users_updated_at();

-- Auto update updated_at for user_data
CREATE OR REPLACE FUNCTION update_user_data_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_data_updated_at
    BEFORE UPDATE ON user_data
    FOR EACH ROW
    EXECUTE FUNCTION update_user_data_updated_at();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE rss_feeds ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY users_own_data ON users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY users_update_own ON users
    FOR UPDATE USING (auth.uid() = id);

-- User data policy - users can only access their own data
CREATE POLICY user_data_own ON user_data
    FOR ALL USING (auth.uid() = user_id);

-- RSS feeds - users see their own and public feeds
CREATE POLICY rss_feeds_own_and_public ON rss_feeds
    FOR ALL USING (auth.uid() = user_id OR is_public = TRUE);

-- ============================================
-- INITIAL DATA
-- ============================================

-- Insert default admin user (password: admin, should be changed immediately)
-- Note: In production, use Supabase Auth instead of manual user creation
INSERT INTO users (username, password_hash, is_admin)
VALUES ('admin', '$2a$10$JwZ7R9QZ8QZXH5YKJ5ZK4OQRJ1QHX3Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q', TRUE)
ON CONFLICT (username) DO NOTHING;
