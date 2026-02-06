-- playground_runs: one row per experiment
CREATE TABLE IF NOT EXISTS playground_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    temperature REAL NOT NULL DEFAULT 0.8,
    slide_mode TEXT NOT NULL DEFAULT 'interactive' CHECK (slide_mode IN ('interactive', 'static')),
    slide_count INTEGER NOT NULL,
    outline JSONB NOT NULL,
    theme JSONB NOT NULL,
    theme_summary JSONB,
    model_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_elapsed_seconds REAL,
    label TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- playground_model_results: one row per model per run
CREATE TABLE IF NOT EXISTS playground_model_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES playground_runs(id) ON DELETE CASCADE,
    model_id TEXT NOT NULL,
    model_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'complete', 'error')),
    slide_htmls JSONB NOT NULL DEFAULT '[]'::jsonb,
    elapsed_seconds REAL,
    error TEXT,
    UNIQUE (run_id, model_id)
);

-- Indexes
CREATE INDEX idx_playground_runs_created ON playground_runs(created_at DESC);
CREATE INDEX idx_playground_model_results_run ON playground_model_results(run_id);

-- RLS: service_role only (admin backend access)
ALTER TABLE playground_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE playground_model_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_playground_runs" ON playground_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_playground_model_results" ON playground_model_results FOR ALL TO service_role USING (true) WITH CHECK (true);
