import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { errorMessage } from "../../library/Response";

const LOGS_DIR = path.join(__dirname, "../../../logs");

const ALLOWED_FILES = ["app.log", "error.log", "http.log"];

const DEFAULT_LINES = 500;
const MAX_LINES = 5000;

// Only read the tail of large files instead of loading the whole thing.
const MAX_BYTES_TO_READ = 2 * 1024 * 1024;

const readTail = (filePath: string, maxBytes: number): string => {
  const { size } = fs.statSync(filePath);
  const start = Math.max(0, size - maxBytes);
  const length = size - start;

  const fd = fs.openSync(filePath, "r");
  const buffer = Buffer.alloc(length);

  fs.readSync(fd, buffer, 0, length, start);
  fs.closeSync(fd);

  return buffer.toString("utf8");
};

const getLog = (req: Request, res: Response) => {
  try {
    const filename =
      typeof req.params.filename === "string" ? req.params.filename : "";

    if (!ALLOWED_FILES.includes(filename)) {
      return errorMessage(res, "Unknown log file");
    }

    const filePath = path.join(LOGS_DIR, filename);

    if (!fs.existsSync(filePath)) {
      return errorMessage(res, "Log file not found");
    }

    if (req.query.clear === "true") {
      fs.truncateSync(filePath, 0);

      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.status(200).send(`${filename} cleared`);
    }

    const linesParam =
      typeof req.query.lines === "string" ? req.query.lines : "";
    const requestedLines = parseInt(linesParam, 10);
    const lineCount = Number.isInteger(requestedLines)
      ? Math.min(Math.max(requestedLines, 1), MAX_LINES)
      : DEFAULT_LINES;

    const content = readTail(filePath, MAX_BYTES_TO_READ);
    const lines = content.split("\n");
    const tail = lines.slice(-lineCount).join("\n");

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(200).send(tail);
  } catch (error: any) {
    return errorMessage(res, `Failed to read log: ${error.message}`);
  }
};

export default { getLog };
