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
import { Server } from "socket.io";
export { io };

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
const adminRoutes = require("./routes/adminRoutes");
const testNotificationRoutes = require("./routes/testNotificationRoutes");
const notificationRoutes = require("./routes/notificationRoutes");

// ─── Security Middleware ────────────────────────────────────────
const allowedOrigins = (
  process.env.ALLOWED_ORIGINS || "http://localhost:3000,http://localhost:3001"
)
  .split(",")
  .map((o: string) => o.trim());

app.use(
  cors({
    origin: "*", // Allows all domains
    methods: ["GET", "POST", "PUT", "DELETE"], // Allowed request methods
    allowedHeaders: ["Content-Type", "Authorization"], // Allowed headers
    credentials: true, // If cookies/auth headers are needed, set this to true
  })
);

app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req: any, res: any, next: any) => {
  /** Log the req */
  Logging.info(
    `Incomming - METHOD: [${req.method}] - URL: [${req.url}] - IP: [${req.socket.remoteAddress}]`
  );

  res.on("finish", () => {
    /** Log the res */
    Logging.info(
      `Result - METHOD: [${req.method}] - URL: [${req.url}] - IP: [${req.socket.remoteAddress}] - STATUS: [${res.statusCode}]`
    );
  });

  next();
});
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

// helmet() defaults to Cross-Origin-Resource-Policy: same-origin, which
// blocks the admin frontend (served from a different origin/port) from
// loading these images at all — the browser reports it as
// net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin. CORS above already allows
// any origin, so relax this specifically for uploaded assets, which are
// meant to be publicly embeddable.
app.use(
  "/uploads",
  (_req, res, next) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(path.join(__dirname, "../uploads"))
);

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
app.use("/admin", adminRoutes);
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
app.use("/test", testNotificationRoutes);
app.use("/notification", notificationRoutes);

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

const io = new Server(server, {
  cors: {
    origin: "*", // your frontend URL
    methods: ["GET", "POST"],
  },
});

// ✅ Store io globally so controllers can use it

// ✅ Socket connection
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // ✅ User joins their own room using user_id
  socket.on("join", (user_id: string) => {
    socket.join(user_id);
    console.log(`User ${user_id} joined room`);
  });
  socket.on("isDeviceConnected", (data) => {
    console.log("Received from Android:", data);

    io.emit("isDeviceConnected", data);
  });
  socket.on("isMobileDeviceConnected", (data) => {
    console.log("Received from Android:", data);

    io.emit("isMobileDeviceConnected", data);
  });
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
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
