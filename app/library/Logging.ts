import chalk from "chalk";
import fs from "fs";
import path from "path";

// Ensure logs directory exists
const logsDir = path.join(__dirname, "../../logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logFile = path.join(logsDir, "app.log");
const errorFile = path.join(logsDir, "error.log");

// Helper to format timestamp
const getTimestamp = (): string => new Date().toISOString();

// Helper to write to file
const writeToFile = (filePath: string, message: string) => {
  fs.appendFileSync(filePath, `${getTimestamp()} ${message}\n`);
};

export default class Logging {
  public static log = (args: any) => this.info(args);

  public static info = (args: any) => {
    const message =
      typeof args === "string" ? args : JSON.stringify(args, null, 2);
    const formatted = chalk.blue(`[${getTimestamp()}] [INFO] ${message}`);
    console.log(formatted);
    writeToFile(logFile, `[INFO] ${message}`);
  };

  public static warn = (args: any) => {
    const message =
      typeof args === "string" ? args : JSON.stringify(args, null, 2);
    const formatted = chalk.yellow(`[${getTimestamp()}] [WARN] ${message}`);
    console.log(formatted);
    writeToFile(logFile, `[WARN] ${message}`);
  };

  public static error = (args: any) => {
    const message =
      typeof args === "string" ? args : JSON.stringify(args, null, 2);
    const formatted = chalk.red(`[${getTimestamp()}] [ERROR] ${message}`);
    console.error(formatted);
    writeToFile(logFile, `[ERROR] ${message}`);
    writeToFile(errorFile, `[ERROR] ${message}`);
  };

  public static debug = (args: any) => {
    const message =
      typeof args === "string" ? args : JSON.stringify(args, null, 2);
    const formatted = chalk.gray(`[${getTimestamp()}] [DEBUG] ${message}`);
    console.debug(formatted);
    writeToFile(logFile, `[DEBUG] ${message}`);
  };
}
