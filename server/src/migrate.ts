import { readFileSync } from "fs";
import { join } from "path";
import pool from "./db";

export async function runMigrations(): Promise<void> {
  const sql = readFileSync(
    join(__dirname, "..", "migrations", "001_sessions.sql"),
    "utf-8"
  );
  await pool.query(sql);
  console.log("Migrations applied successfully");
}
