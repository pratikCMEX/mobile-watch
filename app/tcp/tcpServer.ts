import net from "net";
import Logging from "../library/Logging";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface TcpClient {
  id: string;
  socket: net.Socket;
  remoteAddress: string | undefined;
  connectedAt: Date;

  /**
   * GPS device ID from protocol.
   * Example: 8800000015
   */
  deviceId?: string;

  /**
   * Device IMEI if/when available.
   */
  imei?: string;
}

export interface TcpServerOptions {
  port: number;
  host?: string;
}

// ─────────────────────────────────────────────────────────────
// TCP Server
// ─────────────────────────────────────────────────────────────

class TcpServer {
  private readonly server: net.Server;

  /**
   * Active TCP connections.
   *
   * Key = connection ID
   */
  private readonly clients: Map<string, TcpClient> = new Map();

  /**
   * Device ID -> TCP client
   *
   * This is useful because later you will want to send
   * commands to a particular GPS device.
   */
  private readonly devices: Map<string, TcpClient> = new Map();

  private readonly port: number;
  private readonly host: string;

  constructor(options: TcpServerOptions) {
    this.port = options.port;
    this.host = options.host || "0.0.0.0";

    this.server = net.createServer((socket) => {
      this.handleConnection(socket);
    });

    this.registerServerEvents();
  }

  // ───────────────────────────────────────────────────────────
  // Connection handling
  // ───────────────────────────────────────────────────────────

  private handleConnection(socket: net.Socket): void {
    const connectionId = this.createConnectionId(socket);

    const client: TcpClient = {
      id: connectionId,
      socket,
      remoteAddress: socket.remoteAddress,
      connectedAt: new Date(),
    };

    this.clients.set(connectionId, client);

    Logging.info(
      `GPS TCP client connected: ${connectionId} ` +
        `(active: ${this.clients.size})`
    );

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

    socket.on("data", (data: Buffer) => {
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
      } catch (error) {
        Logging.error(
          `Error processing TCP data [${connectionId}]: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    });

    socket.on("error", (error: Error) => {
      Logging.error(`TCP socket error [${connectionId}]: ${error.message}`);
    });

    socket.on("close", () => {
      this.removeClient(client);

      Logging.info(
        `GPS TCP client disconnected: ${connectionId} ` +
          `(active: ${this.clients.size})`
      );
    });

    socket.on("timeout", () => {
      Logging.info(`TCP socket timeout: ${connectionId}`);

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
  private extractPackets(buffer: string): {
    packets: string[];
    remaining: string;
  } {
    const packets: string[] = [];

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

  private handleMessage(client: TcpClient, message: string): void {
    Logging.info(`GPS packet from ${client.id}: ${message}`);

    const parsed = this.parsePacket(message);

    if (!parsed) {
      Logging.error(`Invalid GPS packet from ${client.id}: ${message}`);

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
        Logging.info(
          `Device ${parsed.deviceId} reconnected. ` +
            `Replacing old TCP connection.`
        );

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

  private parsePacket(message: string): ParsedPacket | null {
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

    const command =
      commaIndex === -1 ? content : content.substring(0, commaIndex);

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

  private handleHeartbeat(client: TcpClient, packet: ParsedPacket): void {
    Logging.info(`LK heartbeat received from device ${packet.deviceId}`);

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

    Logging.info(`LK response sent to device ${packet.deviceId}`);
  }

  // ───────────────────────────────────────────────────────────
  // UD - GPS Location
  // ───────────────────────────────────────────────────────────

  private handleLocation(client: TcpClient, packet: ParsedPacket): void {
    Logging.info(`UD location packet received from device ${packet.deviceId}`);

    const location = this.parseLocation(packet.payload);

    if (!location) {
      Logging.error(
        `Unable to parse UD location packet from ` + `device ${packet.deviceId}`
      );

      return;
    }

    Logging.info(
      `GPS LOCATION | Device: ${packet.deviceId} | ` +
        `Lat: ${location.latitude} ${location.latitudeDirection} | ` +
        `Lng: ${location.longitude} ${location.longitudeDirection} | ` +
        `GPS: ${location.gpsStatus}`
    );
  }

  // ───────────────────────────────────────────────────────────
  // UD location parser
  // ───────────────────────────────────────────────────────────

  private parseLocation(payload: string): GpsLocation | null {
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

  private async handleHeartRate(
    client: TcpClient,
    packet: ParsedPacket
  ): Promise<void> {
    Logging.info(
      `HR heart rate packet received from device ${packet.deviceId}: ${packet.payload}`
    );

    const heartRate = this.parseHeartRate(packet.payload);

    if (!heartRate) {
      Logging.error(
        `Unable to parse HR heart rate packet from device ${packet.deviceId}`
      );

      return;
    }

    Logging.info(
      `HEART RATE | Device: ${packet.deviceId} | ` +
        `BPM: ${heartRate.bpm} | ` +
        `Unit: ${heartRate.unit}`
    );
  }

  private parseHeartRate(payload: string): {
    bpm: number;
    unit: string;
    recordedAt: Date;
  } | null {
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

        recordedAt = new Date(
          `${year}-${month}-${day}T${hours}:${minutes}:${seconds}Z`
        );
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

  private handleAlarm(client: TcpClient, packet: ParsedPacket): void {
    Logging.info(
      `ALARM received from device ${packet.deviceId}: ` + packet.payload
    );

    /**
     * TODO:
     *
     * Parse alarm according to the protocol and
     * save it to your alarms table.
     */
  }

  // ───────────────────────────────────────────────────────────
  // TK - Tracking
  // ───────────────────────────────────────────────────────────

  private handleTracking(client: TcpClient, packet: ParsedPacket): void {
    Logging.info(
      `TK packet received from device ${packet.deviceId}: ` + packet.payload
    );

    /**
     * TODO:
     *
     * Implement according to the supplier protocol.
     */
  }

  // ───────────────────────────────────────────────────────────
  // Unknown command
  // ───────────────────────────────────────────────────────────

  private handleUnknownCommand(client: TcpClient, packet: ParsedPacket): void {
    Logging.info(
      `Unknown GPS command "${packet.command}" ` +
        `from device ${packet.deviceId}`
    );

    Logging.info(`Raw packet: ${packet.raw}`);

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
  // Send data to device
  // ───────────────────────────────────────────────────────────

  private send(client: TcpClient, message: string): void {
    if (client.socket.destroyed) {
      Logging.error(`Cannot send to disconnected device: ${client.id}`);

      return;
    }

    client.socket.write(message);
  }

  // ───────────────────────────────────────────────────────────
  // Find device
  // ───────────────────────────────────────────────────────────

  public getDevice(deviceId: string): TcpClient | undefined {
    return this.devices.get(deviceId);
  }

  // ───────────────────────────────────────────────────────────
  // Send command to specific device
  // ───────────────────────────────────────────────────────────

  public sendToDevice(deviceId: string, message: string): boolean {
    const client = this.devices.get(deviceId);

    if (!client) {
      Logging.error(`Device ${deviceId} is not connected`);

      return false;
    }

    this.send(client, message);

    return true;
  }

  // ───────────────────────────────────────────────────────────
  // Connection ID
  // ───────────────────────────────────────────────────────────

  private createConnectionId(socket: net.Socket): string {
    return `${socket.remoteAddress || "unknown"}:${socket.remotePort || 0}`;
  }

  // ───────────────────────────────────────────────────────────
  // Remove client
  // ───────────────────────────────────────────────────────────

  private removeClient(client: TcpClient): void {
    this.clients.delete(client.id);

    /**
     * Only remove device mapping if it points to this
     * exact connection.
     */
    if (
      client.deviceId &&
      this.devices.get(client.deviceId)?.id === client.id
    ) {
      this.devices.delete(client.deviceId);
    }
  }

  // ───────────────────────────────────────────────────────────
  // Server events
  // ───────────────────────────────────────────────────────────

  private registerServerEvents(): void {
    this.server.on("error", (error: Error) => {
      Logging.error(`TCP server error: ${error.message}`);
    });

    this.server.on("close", () => {
      Logging.info("GPS TCP server closed");
    });
  }

  // ───────────────────────────────────────────────────────────
  // Start
  // ───────────────────────────────────────────────────────────

  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const handleError = (error: Error) => {
        this.server.removeListener("listening", handleListening);
        reject(error);
      };

      const handleListening = () => {
        this.server.removeListener("error", handleError);

        Logging.info(
          `GPS TCP server listening on ` + `${this.host}:${this.port}`
        );

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

  public broadcast(message: string): void {
    this.clients.forEach((client) => {
      this.send(client, message);
    });
  }

  // ───────────────────────────────────────────────────────────
  // Client count
  // ───────────────────────────────────────────────────────────

  public getClientCount(): number {
    return this.clients.size;
  }

  // ───────────────────────────────────────────────────────────
  // Device count
  // ───────────────────────────────────────────────────────────

  public getDeviceCount(): number {
    return this.devices.size;
  }

  // ───────────────────────────────────────────────────────────
  // Stop
  // ───────────────────────────────────────────────────────────

  public stop(): Promise<void> {
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

// ─────────────────────────────────────────────────────────────
// Protocol types
// ─────────────────────────────────────────────────────────────

interface ParsedPacket {
  raw: string;

  manufacturer: string;
  deviceId: string;
  length: string;

  content: string;
  command: string;
  payload: string;
}

interface GpsLocation {
  date: string;
  time: string;

  gpsStatus: string;

  latitude: string;
  latitudeDirection: string;

  longitude: string;
  longitudeDirection: string;

  speed: string;
  direction: string;
  altitude: string;

  satellites: string;

  rawFields: string[];
}

export default TcpServer;
