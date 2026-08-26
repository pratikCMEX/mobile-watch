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
const net_1 = __importDefault(require("net"));
const Logging_1 = __importDefault(require("../library/Logging"));
const models_1 = __importDefault(require("../models"));
// ─────────────────────────────────────────────────────────────
// TCP Server
// ─────────────────────────────────────────────────────────────
class TcpServer {
    constructor(options) {
        /**
         * Active TCP connections.
         *
         * Key = connection ID
         */
        this.clients = new Map();
        /**
         * Device ID -> TCP client
         *
         * This is useful because later you will want to send
         * commands to a particular GPS device.
         */
        this.devices = new Map();
        this.port = options.port;
        this.host = options.host || "0.0.0.0";
        this.server = net_1.default.createServer((socket) => {
            this.handleConnection(socket);
        });
        this.registerServerEvents();
    }
    // ───────────────────────────────────────────────────────────
    // Connection handling
    // ───────────────────────────────────────────────────────────
    handleConnection(socket) {
        const connectionId = this.createConnectionId(socket);
        const client = {
            id: connectionId,
            socket,
            remoteAddress: socket.remoteAddress,
            connectedAt: new Date(),
        };
        this.clients.set(connectionId, client);
        Logging_1.default.info(`GPS TCP client connected: ${connectionId} ` +
            `(active: ${this.clients.size})`);
        /**
         * TCP is a STREAM.
         *
         * One "data" event does NOT necessarily equal one packet.
         *
         * Example:
         *
         * data event #1:
         * [3G*8800000015*0002
         *
         * data event #2:
         * *LK]
         *
         * OR:
         *
         * [packet1][packet2]
         *
         * Therefore we keep a persistent buffer.
         */
        let buffer = "";
        socket.on("data", (data) => {
            try {
                buffer += data.toString("utf8");
                const packets = this.extractPackets(buffer);
                /**
                 * extractPackets() returns:
                 *
                 * {
                 *   packets: string[],
                 *   remaining: string
                 * }
                 */
                buffer = packets.remaining;
                for (const packet of packets.packets) {
                    this.handleMessage(client, packet);
                }
            }
            catch (error) {
                Logging_1.default.error(`Error processing TCP data [${connectionId}]: ${error instanceof Error ? error.message : String(error)}`);
            }
        });
        socket.on("error", (error) => {
            Logging_1.default.error(`TCP socket error [${connectionId}]: ${error.message}`);
        });
        socket.on("close", () => {
            this.removeClient(client);
            if (client.deviceId) {
                this.markDeviceOffline(client.deviceId).catch((error) => Logging_1.default.error(`Failed to mark device ${client.deviceId} offline: ${error.message}`));
            }
            Logging_1.default.info(`GPS TCP client disconnected: ${connectionId} ` +
                `(active: ${this.clients.size})`);
        });
        socket.on("timeout", () => {
            Logging_1.default.info(`TCP socket timeout: ${connectionId}`);
            socket.destroy();
        });
    }
    // ───────────────────────────────────────────────────────────
    // Packet extraction
    // ───────────────────────────────────────────────────────────
    /**
     * Extract complete GPS protocol packets.
     *
     * Expected protocol format:
     *
     * [3G*DEVICE_ID*LEN*CONTENT]
     *
     * Example:
     *
     * [3G*8800000015*0002*LK]
     *
     * IMPORTANT:
     *
     * We do NOT depend on "\n".
     *
     * The GPS protocol uses [ ... ] packet boundaries.
     */
    extractPackets(buffer) {
        const packets = [];
        while (true) {
            const startIndex = buffer.indexOf("[");
            /**
             * No beginning of packet.
             *
             * Keep the remaining data because a packet may be
             * incomplete.
             */
            if (startIndex === -1) {
                return {
                    packets,
                    remaining: buffer,
                };
            }
            /**
             * Remove garbage before the packet.
             */
            if (startIndex > 0) {
                buffer = buffer.slice(startIndex);
            }
            const endIndex = buffer.indexOf("]");
            /**
             * Packet is incomplete.
             *
             * Wait for the next TCP data event.
             */
            if (endIndex === -1) {
                return {
                    packets,
                    remaining: buffer,
                };
            }
            const packet = buffer.slice(0, endIndex + 1);
            buffer = buffer.slice(endIndex + 1);
            if (packet.trim()) {
                packets.push(packet.trim());
            }
        }
    }
    // ───────────────────────────────────────────────────────────
    // Protocol handling
    // ───────────────────────────────────────────────────────────
    handleMessage(client, message) {
        Logging_1.default.info(`GPS packet from ${client.id}: ${message}`);
        const parsed = this.parsePacket(message);
        if (!parsed) {
            Logging_1.default.error(`Invalid GPS packet from ${client.id}: ${message}`);
            return;
        }
        /**
         * Store device ID against this TCP connection.
         */
        if (parsed.deviceId) {
            client.deviceId = parsed.deviceId;
            /**
             * If the same device reconnects, replace its old socket.
             */
            const existingClient = this.devices.get(parsed.deviceId);
            if (existingClient && existingClient.id !== client.id) {
                Logging_1.default.info(`Device ${parsed.deviceId} reconnected. ` +
                    `Replacing old TCP connection.`);
                existingClient.socket.destroy();
            }
            this.devices.set(parsed.deviceId, client);
        }
        /**
         * Route packet based on command.
         */
        switch (parsed.command) {
            case "LK":
                this.handleHeartbeat(client, parsed);
                break;
            case "UD":
                this.handleLocation(client, parsed);
                break;
            case "AL":
                this.handleAlarm(client, parsed);
                break;
            case "TK":
                this.handleTracking(client, parsed);
                break;
            case "HR":
                this.handleHeartRate(client, parsed);
                break;
            default:
                this.handleUnknownCommand(client, parsed);
                break;
        }
    }
    // ───────────────────────────────────────────────────────────
    // Packet parser
    // ───────────────────────────────────────────────────────────
    parsePacket(message) {
        /**
         * Expected:
         *
         * [3G*8800000015*0002*LK]
         *
         * Split only the protocol header.
         */
        const match = message.match(/^\[([^*]+)\*([^*]+)\*([^*]+)\*(.*)\]$/);
        if (!match) {
            return null;
        }
        const manufacturer = match[1];
        const deviceId = match[2];
        const length = match[3];
        const content = match[4];
        /**
         * Example:
         *
         * content = "LK"
         *
         * content = "UD,180916,025723,A,..."
         */
        const commaIndex = content.indexOf(",");
        const command = commaIndex === -1 ? content : content.substring(0, commaIndex);
        const payload = commaIndex === -1 ? "" : content.substring(commaIndex + 1);
        return {
            raw: message,
            manufacturer,
            deviceId,
            length,
            content,
            command,
            payload,
        };
    }
    // ───────────────────────────────────────────────────────────
    // LK - Heartbeat
    // ───────────────────────────────────────────────────────────
    handleHeartbeat(client, packet) {
        Logging_1.default.info(`LK heartbeat received from device ${packet.deviceId}`);
        /**
         * Protocol requirement:
         *
         * Device:
         * [3G*8800000015*0002*LK]
         *
         * Server:
         * [3G*8800000015*0002*LK]
         *
         * So we echo the LK packet back.
         */
        this.send(client, packet.raw);
        Logging_1.default.info(`LK response sent to device ${packet.deviceId}`);
        this.markDeviceOnline(packet.deviceId, packet.payload).catch((error) => Logging_1.default.error(`Failed to update device ${packet.deviceId} from LK: ${error.message}`));
    }
    // ───────────────────────────────────────────────────────────
    // UD - GPS Location
    // ───────────────────────────────────────────────────────────
    handleLocation(client, packet) {
        Logging_1.default.info(`UD location packet received from device ${packet.deviceId}`);
        const location = this.parseLocation(packet.payload);
        if (!location) {
            Logging_1.default.error(`Unable to parse UD location packet from ` + `device ${packet.deviceId}`);
            return;
        }
        Logging_1.default.info(`GPS LOCATION | Device: ${packet.deviceId} | ` +
            `Lat: ${location.latitude} ${location.latitudeDirection} | ` +
            `Lng: ${location.longitude} ${location.longitudeDirection} | ` +
            `GPS: ${location.gpsStatus}`);
        this.saveLocation(packet.deviceId, location).catch((error) => Logging_1.default.error(`Failed to save location for device ${packet.deviceId}: ${error.message}`));
    }
    // ───────────────────────────────────────────────────────────
    // UD location parser
    // ───────────────────────────────────────────────────────────
    parseLocation(payload) {
        const parts = payload.split(",");
        /**
         * Based on the supplier protocol:
         *
         * 0  = date
         * 1  = time
         * 2  = GPS status
         * 3  = latitude
         * 4  = latitude direction
         * 5  = longitude
         * 6  = longitude direction
         * 7  = speed
         * 8  = direction
         * 9  = altitude
         * 10 = satellites
         *
         * The protocol contains additional fields after this.
         */
        if (parts.length < 11) {
            return null;
        }
        return {
            date: parts[0],
            time: parts[1],
            gpsStatus: parts[2],
            latitude: parts[3],
            latitudeDirection: parts[4],
            longitude: parts[5],
            longitudeDirection: parts[6],
            speed: parts[7],
            direction: parts[8],
            altitude: parts[9],
            satellites: parts[10],
            rawFields: parts,
        };
    }
    // ───────────────────────────────────────────────────────────
    // HR - Heart Rate
    // ───────────────────────────────────────────────────────────
    handleHeartRate(client, packet) {
        return __awaiter(this, void 0, void 0, function* () {
            Logging_1.default.info(`HR heart rate packet received from device ${packet.deviceId}: ${packet.payload}`);
            const heartRate = this.parseHeartRate(packet.payload);
            if (!heartRate) {
                Logging_1.default.error(`Unable to parse HR heart rate packet from device ${packet.deviceId}`);
                return;
            }
            Logging_1.default.info(`HEART RATE | Device: ${packet.deviceId} | ` +
                `BPM: ${heartRate.bpm} | ` +
                `Unit: ${heartRate.unit}`);
            this.saveHeartRate(packet.deviceId, heartRate).catch((error) => Logging_1.default.error(`Failed to save heart rate for device ${packet.deviceId}: ${error.message}`));
        });
    }
    parseHeartRate(payload) {
        const parts = payload.split(",");
        /**
         * Expected payload format (example):
         *
         * HR,72,bpm,20260821,052030
         *
         * 0 = command (already stripped, so this is first value after HR)
         * 1 = BPM value
         * 2 = unit (optional)
         * 3 = date (optional, YYYYMMDD)
         * 4 = time (optional, HHMMSS)
         */
        if (parts.length < 1) {
            return null;
        }
        const bpm = parseInt(parts[0], 10);
        if (isNaN(bpm) || bpm < 30 || bpm > 220) {
            return null;
        }
        const unit = parts[1] || "bpm";
        let recordedAt = new Date();
        // If date and time are provided, parse them
        if (parts.length >= 3) {
            const dateStr = parts[2];
            const timeStr = parts[3] || "000000";
            if (dateStr.length === 8 && timeStr.length === 6) {
                const year = dateStr.substring(0, 4);
                const month = dateStr.substring(4, 6);
                const day = dateStr.substring(6, 8);
                const hours = timeStr.substring(0, 2);
                const minutes = timeStr.substring(2, 4);
                const seconds = timeStr.substring(4, 6);
                recordedAt = new Date(`${year}-${month}-${day}T${hours}:${minutes}:${seconds}Z`);
            }
        }
        return {
            bpm,
            unit,
            recordedAt,
        };
    }
    // ───────────────────────────────────────────────────────────
    // AL - Alarm
    // ───────────────────────────────────────────────────────────
    handleAlarm(client, packet) {
        Logging_1.default.info(`ALARM received from device ${packet.deviceId}: ` + packet.payload);
        this.saveAlarm(packet.deviceId, packet.payload).catch((error) => Logging_1.default.error(`Failed to save alarm for device ${packet.deviceId}: ${error.message}`));
    }
    // ───────────────────────────────────────────────────────────
    // TK - Tracking
    // ───────────────────────────────────────────────────────────
    handleTracking(client, packet) {
        Logging_1.default.info(`TK packet received from device ${packet.deviceId}: ` + packet.payload);
        /**
         * TODO:
         *
         * Implement according to the supplier protocol.
         */
    }
    // ───────────────────────────────────────────────────────────
    // Unknown command
    // ───────────────────────────────────────────────────────────
    handleUnknownCommand(client, packet) {
        Logging_1.default.info(`Unknown GPS command "${packet.command}" ` +
            `from device ${packet.deviceId}`);
        Logging_1.default.info(`Raw packet: ${packet.raw}`);
        /**
         * DO NOT send "OK:<message>" here.
         *
         * The protocol has different responses for different
         * commands.
         *
         * Add a response only after confirming it in the
         * supplier protocol.
         */
    }
    // ───────────────────────────────────────────────────────────
    // Database persistence
    // ───────────────────────────────────────────────────────────
    /**
     * The bracket protocol identifies devices by the "deviceId" field
     * in [3G*deviceId*len*content]. We match that against Device.imei.
     * If no matching Device row exists, we log and skip persistence
     * instead of auto-creating a Device (unregistered/unowned devices
     * should not silently start writing rows).
     */
    findDevice(deviceId) {
        return __awaiter(this, void 0, void 0, function* () {
            const device = yield models_1.default.Device.findOne({ where: { imei: deviceId } });
            if (!device) {
                Logging_1.default.info(`No registered Device found for imei ${deviceId}`);
            }
            return device;
        });
    }
    markDeviceOnline(deviceId, payload) {
        return __awaiter(this, void 0, void 0, function* () {
            const device = yield this.findDevice(deviceId);
            if (!device)
                return;
            /**
             * LK payload (when present) is battery,step,turnovers for this
             * protocol family. We only trust the battery field, and only
             * when it looks like a percentage.
             */
            const parts = payload.split(",");
            const battery = parseInt(parts[0], 10);
            yield device.update(Object.assign({ is_online: true, connection_status: "online", last_updated_at: new Date() }, (Number.isInteger(battery) && battery >= 0 && battery <= 100
                ? { battery_percentage: battery }
                : {})));
        });
    }
    markDeviceOffline(deviceId) {
        return __awaiter(this, void 0, void 0, function* () {
            const device = yield this.findDevice(deviceId);
            if (!device)
                return;
            yield device.update({
                is_online: false,
                connection_status: "offline",
                last_updated_at: new Date(),
            });
        });
    }
    /**
     * Converts "ddmm.mmmm" (degrees + minutes) to decimal degrees,
     * applying sign for S/W directions. This is the coordinate format
     * used by the NMEA-derived GPS watch protocols in this family.
     */
    convertCoordinate(raw, direction) {
        const value = parseFloat(raw);
        if (isNaN(value))
            return null;
        const degrees = Math.floor(value / 100);
        const minutes = value - degrees * 100;
        const decimal = degrees + minutes / 60;
        return direction === "S" || direction === "W" ? -decimal : decimal;
    }
    /**
     * Date/time fields are DDMMYY / HHMMSS (matches $GPRMC-derived
     * encoding used by this protocol family).
     */
    parseRecordedAt(date, time) {
        if (date.length === 6 && time.length === 6) {
            const day = date.substring(0, 2);
            const month = date.substring(2, 4);
            const year = `20${date.substring(4, 6)}`;
            const hours = time.substring(0, 2);
            const minutes = time.substring(2, 4);
            const seconds = time.substring(4, 6);
            const parsed = new Date(`${year}-${month}-${day}T${hours}:${minutes}:${seconds}Z`);
            if (!isNaN(parsed.getTime()))
                return parsed;
        }
        return new Date();
    }
    saveLocation(deviceId, location) {
        return __awaiter(this, void 0, void 0, function* () {
            const device = yield this.findDevice(deviceId);
            if (!device)
                return;
            const latitude = this.convertCoordinate(location.latitude, location.latitudeDirection);
            const longitude = this.convertCoordinate(location.longitude, location.longitudeDirection);
            if (latitude === null || longitude === null) {
                Logging_1.default.error(`Could not convert coordinates for device ${deviceId}: ` +
                    `${location.latitude}${location.latitudeDirection}, ` +
                    `${location.longitude}${location.longitudeDirection}`);
                return;
            }
            yield models_1.default.Location.create({
                device_id: device.id,
                latitude,
                longitude,
                speed_kmh: parseFloat(location.speed) || null,
                direction: location.direction || null,
                is_valid_fix: location.gpsStatus === "A",
                recorded_at: this.parseRecordedAt(location.date, location.time),
            });
            yield device.update({
                last_updated_at: new Date(),
                gps_strength: parseInt(location.satellites, 10) >= 4 ? "strong" : "weak",
            });
        });
    }
    saveHeartRate(deviceId, heartRate) {
        return __awaiter(this, void 0, void 0, function* () {
            const device = yield this.findDevice(deviceId);
            if (!device)
                return;
            yield models_1.default.HealthMetric.create({
                device_id: device.id,
                metric_type: "heart_rate",
                value_primary: heartRate.bpm,
                value_secondary: null,
                unit: heartRate.unit,
                recorded_at: heartRate.recordedAt,
            });
        });
    }
    saveAlarm(deviceId, payload) {
        return __awaiter(this, void 0, void 0, function* () {
            const device = yield this.findDevice(deviceId);
            if (!device)
                return;
            yield models_1.default.Notification.create({
                device_id: device.id,
                user_id: null,
                type: "alarm",
                title: "Device alarm",
                body: payload,
                metadata: { raw: payload },
                is_read: "0",
            });
        });
    }
    // ───────────────────────────────────────────────────────────
    // Send data to device
    // ───────────────────────────────────────────────────────────
    send(client, message) {
        if (client.socket.destroyed) {
            Logging_1.default.error(`Cannot send to disconnected device: ${client.id}`);
            return;
        }
        client.socket.write(message);
    }
    // ───────────────────────────────────────────────────────────
    // Find device
    // ───────────────────────────────────────────────────────────
    getDevice(deviceId) {
        return this.devices.get(deviceId);
    }
    // ───────────────────────────────────────────────────────────
    // Send command to specific device
    // ───────────────────────────────────────────────────────────
    sendToDevice(deviceId, message) {
        const client = this.devices.get(deviceId);
        if (!client) {
            Logging_1.default.error(`Device ${deviceId} is not connected`);
            return false;
        }
        this.send(client, message);
        return true;
    }
    // ───────────────────────────────────────────────────────────
    // Connection ID
    // ───────────────────────────────────────────────────────────
    createConnectionId(socket) {
        return `${socket.remoteAddress || "unknown"}:${socket.remotePort || 0}`;
    }
    // ───────────────────────────────────────────────────────────
    // Remove client
    // ───────────────────────────────────────────────────────────
    removeClient(client) {
        var _a;
        this.clients.delete(client.id);
        /**
         * Only remove device mapping if it points to this
         * exact connection.
         */
        if (client.deviceId &&
            ((_a = this.devices.get(client.deviceId)) === null || _a === void 0 ? void 0 : _a.id) === client.id) {
            this.devices.delete(client.deviceId);
        }
    }
    // ───────────────────────────────────────────────────────────
    // Server events
    // ───────────────────────────────────────────────────────────
    registerServerEvents() {
        this.server.on("error", (error) => {
            Logging_1.default.error(`TCP server error: ${error.message}`);
        });
        this.server.on("close", () => {
            Logging_1.default.info("GPS TCP server closed");
        });
    }
    // ───────────────────────────────────────────────────────────
    // Start
    // ───────────────────────────────────────────────────────────
    start() {
        return new Promise((resolve, reject) => {
            const handleError = (error) => {
                this.server.removeListener("listening", handleListening);
                reject(error);
            };
            const handleListening = () => {
                this.server.removeListener("error", handleError);
                Logging_1.default.info(`GPS TCP server listening on ` + `${this.host}:${this.port}`);
                resolve();
            };
            this.server.once("error", handleError);
            this.server.once("listening", handleListening);
            this.server.listen(this.port, this.host);
        });
    }
    // ───────────────────────────────────────────────────────────
    // Broadcast
    // ───────────────────────────────────────────────────────────
    broadcast(message) {
        this.clients.forEach((client) => {
            this.send(client, message);
        });
    }
    // ───────────────────────────────────────────────────────────
    // Client count
    // ───────────────────────────────────────────────────────────
    getClientCount() {
        return this.clients.size;
    }
    // ───────────────────────────────────────────────────────────
    // Device count
    // ───────────────────────────────────────────────────────────
    getDeviceCount() {
        return this.devices.size;
    }
    // ───────────────────────────────────────────────────────────
    // Stop
    // ───────────────────────────────────────────────────────────
    stop() {
        return new Promise((resolve) => {
            this.clients.forEach((client) => {
                client.socket.destroy();
            });
            this.clients.clear();
            this.devices.clear();
            /**
             * If server is not running, close() can emit an error.
             */
            if (!this.server.listening) {
                resolve();
                return;
            }
            this.server.close(() => {
                resolve();
            });
        });
    }
}
exports.default = TcpServer;
