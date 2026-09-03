const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  CODEX_TASK_BRIEF_VERSION,
  normalizeCodexTaskBrief,
  sendCodexTaskBrief,
} = require("../electron/codex-task-brief.cjs");

const REPORTER_STATE_VERSION = 1;
const REPORTER_STATES = new Set(["thinking", "working", "waiting", "completed", "error"]);
const DEFAULT_STATE_DIRECTORY = path.join(os.tmpdir(), "deskmate-codex-task-brief-reporter-v1");

function parseArguments(argv = []) {
  const allowed = new Set(["task-key", "task-label", "state", "milestone"]);
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error("codex-task-brief-argument-invalid");
    const key = token.slice(2);
    if (!allowed.has(key) || Object.hasOwn(values, key)) throw new Error("codex-task-brief-argument-invalid");
    const value = argv[index + 1];
    if (typeof value !== "string" || value.startsWith("--")) throw new Error("codex-task-brief-argument-invalid");
    values[key] = value;
    index += 1;
  }
  if (!values["task-key"] || !REPORTER_STATES.has(values.state)) throw new Error("codex-task-brief-argument-invalid");
  return Object.freeze({ taskKey: values["task-key"], taskLabel: values["task-label"] || "", state: values.state, milestone: values.milestone || "" });
}

function stateFileFor(taskKey, stateDirectory = DEFAULT_STATE_DIRECTORY) {
  const digest = crypto.createHash("sha256").update(String(taskKey), "utf8").digest("hex").slice(0, 32);
  return path.join(stateDirectory, `${digest}.json`);
}

function readReporterState(filePath) {
  try {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (value?.version !== REPORTER_STATE_VERSION || typeof value.taskKey !== "string" || typeof value.taskLabel !== "string" || !Number.isInteger(value.sequence) || value.sequence < 1 || value.sequence > 0xffffffff) return null;
    return value;
  } catch {
    return null;
  }
}

function writeReporterState(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporary, filePath);
}

function reserveCodexTaskBrief({ taskKey, taskLabel = "", state, milestone = "" }, { stateDirectory = DEFAULT_STATE_DIRECTORY } = {}) {
  const filePath = stateFileFor(taskKey, stateDirectory);
  const previous = readReporterState(filePath);
  if (previous && previous.taskKey !== taskKey) throw new Error("codex-task-brief-state-conflict");
  const nextLabel = taskLabel || previous?.taskLabel || "";
  const nextSequence = previous ? previous.sequence + 1 : 1;
  if (nextSequence > 0xffffffff) throw new Error("codex-task-brief-sequence-exhausted");
  const report = normalizeCodexTaskBrief({ version: CODEX_TASK_BRIEF_VERSION, provider: "codex", taskKey, taskLabel: nextLabel, state, milestone, sequence: nextSequence });
  if (!report) throw new Error("codex-task-brief-invalid");
  writeReporterState(filePath, { version: REPORTER_STATE_VERSION, taskKey: report.taskKey, taskLabel: report.taskLabel, sequence: report.sequence });
  return report;
}

async function reportCodexTaskBrief(argv = process.argv.slice(2), options = {}) {
  let report;
  try {
    report = reserveCodexTaskBrief(parseArguments(argv), options);
  } catch (error) {
    return { ok: false, reason: /^codex-task-brief-[a-z-]+$/.test(error?.message || "") ? error.message : "codex-task-brief-invalid" };
  }
  const result = await (options.send || sendCodexTaskBrief)(report);
  return { ok: result?.ok === true, reason: result?.ok ? "" : result?.reason || "codex-task-brief-send-failed", sequence: report.sequence, state: report.state };
}

if (require.main === module) {
  reportCodexTaskBrief().then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = result.ok ? 0 : 1;
  }).catch(() => {
    process.stdout.write('{"ok":false,"reason":"codex-task-brief-send-failed"}\n');
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_STATE_DIRECTORY,
  REPORTER_STATE_VERSION,
  parseArguments,
  readReporterState,
  reportCodexTaskBrief,
  reserveCodexTaskBrief,
  stateFileFor,
};
