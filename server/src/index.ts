import express from "express";
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
