import { appendFileSync } from "fs";
import { join } from "path";

const LOG_FILE = join(process.cwd(), "debug.log");

export function log(level: "INFO" | "WARN" | "ERROR", message: string, data?: unknown): void {
  const ts = new Date().toISOString();
  const dataStr =
    data !== undefined
      ? "\n    " + JSON.stringify(data, null, 2).split("\n").join("\n    ")
      : "";
  const line = `[${ts}] [${level}] ${message}${dataStr}\n`;
  try {
    appendFileSync(LOG_FILE, line, "utf8");
  } catch {
    /* never crash the pipeline because of logging */
  }
  if (level === "ERROR") console.error(line.trimEnd());
  else console.log(line.trimEnd());
}

export function logRun(label: string): void {
  const separator = `\n${"=".repeat(60)}\n=== ${label} — ${new Date().toISOString()} ===\n${"=".repeat(60)}\n`;
  try {
    appendFileSync(LOG_FILE, separator, "utf8");
  } catch { /* ignore */ }
  console.log(separator.trim());
}
