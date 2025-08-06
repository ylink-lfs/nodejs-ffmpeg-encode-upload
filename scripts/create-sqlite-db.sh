sqlite3 /tmp/database.sqlite <<EOF
DROP TABLE IF EXISTS transcoding_jobs;
CREATE TABLE transcoding_jobs (
    job_id TEXT PRIMARY KEY,
    job_state TEXT NOT NULL DEFAULT 'waiting' 
        CHECK (job_state IN ('waiting', 'progressing', 'completed', 'failed')),
    input_s3_key TEXT NOT NULL,
    output_s3_key TEXT,
    target_quality TEXT NOT NULL,
    submit_ts INTEGER NOT NULL,
    callback_data TEXT -- JSON string to store callback result data
);
EOF
