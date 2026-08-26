"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Logging_1 = __importDefault(require("./library/Logging"));
const http_1 = __importDefault(require("http"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const helmet_1 = __importDefault(require("helmet"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const config_1 = require("./config/config");
const models_1 = __importDefault(require("./models"));
const tcpServer_1 = __importDefault(require("./tcp/tcpServer"));
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const userRoutes = require("./routes/userRoutes");
const authRoutes = require("./routes/authRoutes");
const healthRoutes = require("./routes/healthmetricsRoutes");
const deviceRoutes = require("./routes/deviceRoutes");
const userDeviceRoutes = require("./routes/userDeviceRoutes");
const snapshotRoutes = require("./routes/snapshotRoutes");
// ─── Security Middleware ────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:3000,http://localhost:3001")
    .split(",")
    .map((o) => o.trim());
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        }
        else {
            callback(new Error("Not allowed by CORS"));
        }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
}));
app.use((0, helmet_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use("/webhook", express_1.default.raw({ type: "application/json" }));
// ─── Rate Limiting ──────────────────────────────────────────────
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many requests, please try again later.",
    },
});
app.use("/api", limiter);
app.use("/uploads", express_1.default.static(path_1.default.join(__dirname, "../uploads")));
// ─── HTTP Request Logger (Morgan → File) ────────────────────────
const logsDir = path_1.default.join(__dirname, "../logs");
if (!fs_1.default.existsSync(logsDir)) {
    fs_1.default.mkdirSync(logsDir, { recursive: true });
}
const httpLogStream = fs_1.default.createWriteStream(path_1.default.join(logsDir, "http.log"), {
    flags: "a",
});
const morgan = require("morgan");
app.use(morgan(`:remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"`, { stream: httpLogStream }));
// ─── Custom Request Logger ──────────────────────────────────────
app.use((req, res, next) => {
    Logging_1.default.info(`→ [${req.method}] ${req.url} - IP: ${req.socket.remoteAddress}`);
    res.on("finish", () => {
        Logging_1.default.info(`← [${req.method}] ${req.url} - STATUS: ${res.statusCode}`);
    });
    next();
});
// ─── Routes ────────────────────────────────────────────────────
app.use("/admin", userRoutes);
app.use("/auth", authRoutes);
app.use("/device", deviceRoutes);
app.use("/user/device", userDeviceRoutes);
app.use("/health", healthRoutes);
app.use("/snapshot", snapshotRoutes);
// ─── Healthcheck ───────────────────────────────────────────────
app.get("/ping", (req, res) => {
    res.status(200).json({ status: "ok" });
});
// ─── 404 Handler ──────────────────────────────────────────────
app.use((req, res) => {
    if (req.url.startsWith("/socket.io"))
        return;
    Logging_1.default.error(`Route not found: ${req.url}`);
    res.status(404).json({ message: "Route not found" });
});
// ─── Global Error Handler ──────────────────────────────────────
app.use((err, req, res, next) => {
    Logging_1.default.error(`Unhandled Error: ${err.message}`);
    if (err.stack) {
        Logging_1.default.error(`Stack: ${err.stack}`);
    }
    res.status(err.status || 500).json({
        success: false,
        message: err.message || "Internal Server Error",
    });
});
// ─── Start Server ──────────────────────────────────────────────
server.listen(config_1.config.server.port, "0.0.0.0", () => __awaiter(void 0, void 0, void 0, function* () {
    Logging_1.default.info(`Server running on port ${config_1.config.server.port}`);
    try {
        yield models_1.default.sequelize.authenticate();
        Logging_1.default.info("Database connected successfully");
    }
    catch (error) {
        Logging_1.default.error(`Database connection failed: ${error.message}`);
    }
}));
// ─── Start TCP Server ──────────────────────────────────────────
const tcpServer = new tcpServer_1.default({ port: config_1.config.tcp.port });
tcpServer.start().catch((err) => {
    Logging_1.default.error(`Failed to start TCP server: ${err.message}`);
});
// ─── Unhandled Rejection & Uncaught Exception Handlers ────────
process.on("unhandledRejection", (reason, promise) => {
    Logging_1.default.error(`Unhandled Rejection at: ${promise}, reason: ${(reason === null || reason === void 0 ? void 0 : reason.message) || reason}`);
    if (reason === null || reason === void 0 ? void 0 : reason.stack) {
        Logging_1.default.error(`Stack: ${reason.stack}`);
    }
});
process.on("uncaughtException", (error) => {
    Logging_1.default.error(`Uncaught Exception: ${error.message}`);
    Logging_1.default.error(`Stack: ${error.stack}`);
    process.exit(1);
});
