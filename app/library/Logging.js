"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
const chalk_1 = __importDefault(require("chalk"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// Ensure logs directory exists
const logsDir = path_1.default.join(__dirname, "../../logs");
if (!fs_1.default.existsSync(logsDir)) {
    fs_1.default.mkdirSync(logsDir, { recursive: true });
}
const logFile = path_1.default.join(logsDir, "app.log");
const errorFile = path_1.default.join(logsDir, "error.log");
// Helper to format timestamp
const getTimestamp = () => new Date().toISOString();
// Helper to write to file
const writeToFile = (filePath, message) => {
    fs_1.default.appendFileSync(filePath, `${getTimestamp()} ${message}\n`);
};
class Logging {
}
_a = Logging;
Logging.log = (args) => _a.info(args);
Logging.info = (args) => {
    const message = typeof args === "string" ? args : JSON.stringify(args, null, 2);
    const formatted = chalk_1.default.blue(`[${getTimestamp()}] [INFO] ${message}`);
    console.log(formatted);
    writeToFile(logFile, `[INFO] ${message}`);
};
Logging.warn = (args) => {
    const message = typeof args === "string" ? args : JSON.stringify(args, null, 2);
    const formatted = chalk_1.default.yellow(`[${getTimestamp()}] [WARN] ${message}`);
    console.log(formatted);
    writeToFile(logFile, `[WARN] ${message}`);
};
Logging.error = (args) => {
    const message = typeof args === "string" ? args : JSON.stringify(args, null, 2);
    const formatted = chalk_1.default.red(`[${getTimestamp()}] [ERROR] ${message}`);
    console.error(formatted);
    writeToFile(logFile, `[ERROR] ${message}`);
    writeToFile(errorFile, `[ERROR] ${message}`);
};
Logging.debug = (args) => {
    const message = typeof args === "string" ? args : JSON.stringify(args, null, 2);
    const formatted = chalk_1.default.gray(`[${getTimestamp()}] [DEBUG] ${message}`);
    console.debug(formatted);
    writeToFile(logFile, `[DEBUG] ${message}`);
};
exports.default = Logging;
