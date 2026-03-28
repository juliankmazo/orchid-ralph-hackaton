import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import pool from "./db";
import { runMigrations } from "./migrate";

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);
const API_KEY = process.env.API_KEY;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  } catch {
    res.json({ status: "ok", db: "disconnected" });
  }
});

function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers["x-api-key"];
  if (!API_KEY || key !== API_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

app.put("/sessions/:id", requireApiKey, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { user_name, user_email, working_dir, git_remotes, branch, tool, transcript, status } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO sessions (id, user_name, user_email, working_dir, git_remotes, branch, tool, transcript, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (id) DO UPDATE SET
         user_name   = EXCLUDED.user_name,
         user_email  = EXCLUDED.user_email,
         working_dir = EXCLUDED.working_dir,
         git_remotes = EXCLUDED.git_remotes,
         branch      = EXCLUDED.branch,
         tool        = EXCLUDED.tool,
         transcript  = EXCLUDED.transcript,
         status      = EXCLUDED.status,
         updated_at  = NOW()
       RETURNING *`,
      [id, user_name, user_email, working_dir, JSON.stringify(git_remotes), branch, tool, transcript, status || "active"]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error("PUT /sessions/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/sessions", requireApiKey, async (req: Request, res: Response) => {
  try {
    const q = req.query.q as string | undefined;
    let result;
    if (q) {
      result = await pool.query(
        `SELECT id, user_name, user_email, working_dir, git_remotes, branch, tool, started_at, updated_at, status
         FROM sessions
         WHERE transcript ILIKE $1
         ORDER BY started_at DESC`,
        [`%${q}%`]
      );
    } else {
      result = await pool.query(
        `SELECT id, user_name, user_email, working_dir, git_remotes, branch, tool, started_at, updated_at, status
         FROM sessions
         ORDER BY started_at DESC`
      );
    }
    res.json(result.rows);
  } catch (err) {
    console.error("GET /sessions error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/sessions/:id", requireApiKey, async (req: Request, res: Response) => {
  try {
    const result = await pool.query("SELECT * FROM sessions WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("GET /sessions/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/stats", requireApiKey, async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total_sessions,
        COUNT(*) FILTER (WHERE status = 'active') as active_sessions,
        COUNT(DISTINCT user_name) as unique_users,
        MIN(started_at) as first_session,
        MAX(updated_at) as last_activity
      FROM sessions
    `);
    res.json(result.rows[0]);
  } catch (err) {
    console.error("GET /stats error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

async function start() {
  try {
    await runMigrations();
  } catch (err) {
    console.error("Migration failed:", err);
  }

  app.listen(PORT, () => {
    console.log(`Orchid server listening on port ${PORT}`);
    if (!API_KEY) {
      console.warn("WARNING: API_KEY is not set");
    }
  });
}

start();

export default app;
