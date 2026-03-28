import express, { Request, Response, NextFunction } from "express";
import pool from "./db";
import { runMigrations } from "./migrate";

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);
const API_KEY = process.env.API_KEY;

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
