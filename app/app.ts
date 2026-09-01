import Logging from "./library/Logging";
import http from "http";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import path from "path";
import fs from "fs";
import { config } from "./config/config";
import db from "./models";
import TcpServer from "./tcp/tcpServer";

const app = express();
const server = http.createServer(app);

const userRoutes = require("./routes/userRoutes");
const authRoutes = require("./routes/authRoutes");
const healthRoutes = require("./routes/healthmetricsRoutes");
const deviceRoutes = require("./routes/deviceRoutes");
const logRoutes = require("./routes/logRoutes");
const userDeviceRoutes = require("./routes/userDeviceRoutes");
const homeRoutes = require("./routes/homeRoutes");
const snapshotRoutes = require("./routes/snapshotRoutes");
const emergencyContactRoutes = require("./routes/emergencyContactRoutes");
const geofenceRoutes = require("./routes/geofenceRoutes");
const sceneModeRoutes = require("./routes/sceneModeRoutes");

// ─── Security Middleware ────────────────────────────────────────
const allowedOrigins = (
  process.env.ALLOWED_ORIGINS || "http://localhost:3000,http://localhost:3001"
)
  .split(",")
  .map((o: string) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/webhook", express.raw({ type: "application/json" }));

// ─── Rate Limiting ──────────────────────────────────────────────
const limiter = rateLimit({
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

app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// ─── HTTP Request Logger (Morgan → File) ────────────────────────
const logsDir = path.join(__dirname, "../logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}
const httpLogStream = fs.createWriteStream(path.join(logsDir, "http.log"), {
  flags: "a",
});

const morgan = require("morgan");
app.use(
  morgan(
    `:remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"`,
    { stream: httpLogStream }
  )
);

// ─── Custom Request Logger ──────────────────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  Logging.info(
    `→ [${req.method}] ${req.url} - IP: ${req.socket.remoteAddress}`
  );
  res.on("finish", () => {
    Logging.info(`← [${req.method}] ${req.url} - STATUS: ${res.statusCode}`);
  });
  next();
});

// ─── Routes ────────────────────────────────────────────────────
app.use("/admin", userRoutes);
app.use("/auth", authRoutes);
app.use("/device", deviceRoutes);
app.use("/user/device", userDeviceRoutes);
app.use("/user", homeRoutes);
app.use("/health", healthRoutes);
app.use("/snapshot", snapshotRoutes);
app.use("/log", logRoutes);
app.use("/emergency_contact", emergencyContactRoutes);
app.use("/geofence", geofenceRoutes);
app.use("/scene_mode", sceneModeRoutes);

// ─── Healthcheck ───────────────────────────────────────────────
app.get("/ping", (req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

// ─── 404 Handler ──────────────────────────────────────────────
app.use((req: Request, res: Response) => {
  if (req.url.startsWith("/socket.io")) return;
  Logging.error(`Route not found: ${req.url}`);
  res.status(404).json({ message: "Route not found" });
});

// ─── Global Error Handler ──────────────────────────────────────
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  Logging.error(`Unhandled Error: ${err.message}`);
  if (err.stack) {
    Logging.error(`Stack: ${err.stack}`);
  }
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

// ─── Start Server ──────────────────────────────────────────────
server.listen(config.server.port, "0.0.0.0", async () => {
  Logging.info(`Server running on port ${config.server.port}`);
  try {
    await db.sequelize.authenticate();
    Logging.info("Database connected successfully");
  } catch (error: any) {
    Logging.error(`Database connection failed: ${error.message}`);
  }
});

// ─── Start TCP Server ──────────────────────────────────────────
const tcpServer = new TcpServer({ port: config.tcp.port });
tcpServer.start().catch((err: any) => {
  Logging.error(`Failed to start TCP server: ${err.message}`);
});

// Export tcpServer for use in controllers
export { tcpServer };

// ─── Unhandled Rejection & Uncaught Exception Handlers ────────
process.on("unhandledRejection", (reason: any, promise: any) => {
  Logging.error(
    `Unhandled Rejection at: ${promise}, reason: ${reason?.message || reason}`
  );
  if (reason?.stack) {
    Logging.error(`Stack: ${reason.stack}`);
  }
});

process.on("uncaughtException", (error: Error) => {
  Logging.error(`Uncaught Exception: ${error.message}`);
  Logging.error(`Stack: ${error.stack}`);
  process.exit(1);
});
