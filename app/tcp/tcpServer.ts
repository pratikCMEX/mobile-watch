import net from "net";
import Logging from "../library/Logging";
import db from "../models";

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

      if (client.deviceId) {
        this.markDeviceOffline(client.deviceId).catch((error: Error) =>
          Logging.error(
            `Failed to mark device ${client.deviceId} offline: ${error.message}`
          )
        );
      }

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

      case "UD_LTE":
        this.handleLteLocation(client, parsed);
        break;

      case "bphrt":
        this.handleBloodPressureHeartRate(client, parsed);
        break;

      case "oxygen":
        this.handleOxygen(client, parsed);
        break;

      case "btemp2":
        this.handleTemperature(client, parsed);
        break;

      case "calllog":
        this.handleCallLog(client, parsed);
        break;

      case "CONFIG":
        this.handleConfig(client, parsed);
        break;

      case "CS":
        this.handleSceneModeResponse(client, parsed);
        break;

      case "ICCID":
        this.handleIccid(client, parsed);
        break;

      case "RYIMEI":
        this.handleRyimei(client, parsed);
        break;

      case "TS":
        this.handleDeviceStatusResponse(client, parsed);
        break;

      case "RESET":
        this.handleRestartResponse(client, parsed);
        break;

      case "img":
        this.handleImageResponse(client, parsed);
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
    Logging.info(
      `LK heartbeat received from device ${packet.deviceId}: ${packet.payload}`
    );

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

    this.markDeviceOnline(packet.deviceId).catch((error: Error) =>
      Logging.error(
        `Failed to update device ${packet.deviceId} from LK: ${error.message}`
      )
    );

    /**
     * LK payload format: LK,battery,steps,turnovers
     *
     * Example: LK,0,0,45
     *
     * Save each field as a HealthMetric so the heartbeat
     * contributes to the device's health history.
     */
    const parts = packet.payload.split(",");
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

    this.saveLocation(packet.deviceId, location, packet.command).catch(
      (error: Error) =>
        Logging.error(
          `Failed to save location for device ${packet.deviceId}: ${error.message}`
        )
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

    this.saveHeartRate(packet.deviceId, heartRate).catch((error: Error) =>
      Logging.error(
        `Failed to save heart rate for device ${packet.deviceId}: ${error.message}`
      )
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

    this.saveAlarm(packet.deviceId, packet.payload).catch((error: Error) =>
      Logging.error(
        `Failed to save alarm for device ${packet.deviceId}: ${error.message}`
      )
    );
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
  // UD_LTE - GPS location (LTE watches: decimal-degree coordinates
  // plus cell/WiFi positioning info, unlike the plain UD command)
  // ───────────────────────────────────────────────────────────

  private handleLteLocation(client: TcpClient, packet: ParsedPacket): void {
    Logging.info(
      `UD_LTE location packet received from device ${packet.deviceId}`
    );

    const location = this.parseLteLocation(packet.payload);

    if (!location) {
      Logging.error(
        `Unable to parse UD_LTE location packet from device ${packet.deviceId}`
      );

      return;
    }

    Logging.info(
      `LTE LOCATION | Device: ${packet.deviceId} | ` +
        `Lat: ${location.latitude} ${location.latitudeDirection} | ` +
        `Lng: ${location.longitude} ${location.longitudeDirection} | ` +
        `Battery: ${location.battery} | Signal: ${location.gsmSignal}`
    );
    Logging.info(`packet.command: ${packet.command}`);

    this.saveLteLocation(packet.deviceId, location, packet.command).catch(
      (error: Error) =>
        Logging.error(
          `Failed to save LTE location for device ${packet.deviceId}: ${error.message}`
        )
    );
  }

  /**
   * UD_LTE payload fields we can confirm from real device traffic:
   *
   * 0 date (DDMMYY), 1 time (HHMMSS), 2 GPS status, 3 latitude (decimal
   * degrees - NOT ddmm.mm like plain UD), 4 lat direction, 5 longitude
   * (decimal degrees), 6 lon direction, 7 speed, 8 course, 9 altitude,
   * 10 satellites, 11 battery %, 12 GSM signal.
   *
   * Fields after index 12 (status flags, cell tower MCC/MNC/LAC/CID,
   * nearby WiFi AP MAC/RSSI list) are present but not confidently
   * mapped yet - left unparsed rather than guessed.
   */
  private parseLteLocation(payload: string): GpsLocation | null {
    const parts = payload.split(",");

    if (parts.length < 13) {
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
      battery: parts[11],
      gsmSignal: parts[12],

      rawFields: parts,
    };
  }

  private async saveLteLocation(
    deviceId: string,
    location: GpsLocation,
    networkType: string
  ): Promise<void> {
    const device = await this.findDevice(deviceId);
    Logging.info(`saveLteLocation networkType: ${networkType}`);
    if (!device) return;

    const latitude = this.convertDecimalCoordinate(
      location.latitude,
      location.latitudeDirection
    );
    const longitude = this.convertDecimalCoordinate(
      location.longitude,
      location.longitudeDirection
    );

    if (latitude === null || longitude === null) {
      Logging.error(
        `Could not convert LTE coordinates for device ${deviceId}: ` +
          `${location.latitude}${location.latitudeDirection}, ` +
          `${location.longitude}${location.longitudeDirection}`
      );

      return;
    }

    await db.Location.create({
      device_id: device.id,
      latitude,
      longitude,
      speed_kmh: parseFloat(location.speed) || null,
      direction: location.direction || null,
      is_valid_fix: location.gpsStatus === "A",
      recorded_at: this.parseRecordedAt(location.date, location.time),
    });

    const battery = parseInt(location.battery || "", 10);

    await device.update({
      last_updated_at: new Date(),
      gps_strength: parseInt(location.satellites, 10) >= 4 ? "strong" : "weak",
      signal_status: location.gsmSignal || null,
      is_online: true,
      connection_status: "online",
      network_type: networkType,
      ...(Number.isInteger(battery) && battery >= 0 && battery <= 100
        ? { battery_percentage: battery }
        : {}),
    });
  }

  // ───────────────────────────────────────────────────────────
  // bphrt - Blood pressure + heart rate
  // ───────────────────────────────────────────────────────────

  /**
   * Payload: bphrt,systolic,diastolic,heartRateBpm,,,,
   * (trailing empty fields observed but not mapped yet)
   */
  private handleBloodPressureHeartRate(
    client: TcpClient,
    packet: ParsedPacket
  ): void {
    Logging.info(
      `bphrt packet received from device ${packet.deviceId}: ${packet.payload}`
    );

    const parts = packet.payload.split(",");
    const systolic = parseInt(parts[0], 10);
    const diastolic = parseInt(parts[1], 10);
    const heartRate = parseInt(parts[2], 10);
    const recordedAt = new Date();

    if (Number.isInteger(systolic) && Number.isInteger(diastolic)) {
      this.saveHealthMetric(
        packet.deviceId,
        "blood_pressure",
        systolic,
        diastolic,
        "mmHg",
        recordedAt
      ).catch((error: Error) =>
        Logging.error(
          `Failed to save blood pressure for device ${packet.deviceId}: ${error.message}`
        )
      );
    }

    if (Number.isInteger(heartRate)) {
      this.saveHealthMetric(
        packet.deviceId,
        "heart_rate",
        heartRate,
        null,
        "bpm",
        recordedAt
      ).catch((error: Error) =>
        Logging.error(
          `Failed to save heart rate for device ${packet.deviceId}: ${error.message}`
        )
      );
    }
  }

  // ───────────────────────────────────────────────────────────
  // oxygen - SpO2
  // ───────────────────────────────────────────────────────────

  /**
   * Payload: oxygen,<unknown flag>,spo2Percent
   */
  private handleOxygen(client: TcpClient, packet: ParsedPacket): void {
    Logging.info(
      `oxygen packet received from device ${packet.deviceId}: ${packet.payload}`
    );

    const parts = packet.payload.split(",");
    const spo2 = parseInt(parts[1], 10);

    if (!Number.isInteger(spo2)) return;

    this.saveHealthMetric(
      packet.deviceId,
      "spo2",
      spo2,
      null,
      "%",
      new Date()
    ).catch((error: Error) =>
      Logging.error(
        `Failed to save SpO2 for device ${packet.deviceId}: ${error.message}`
      )
    );
  }

  // ───────────────────────────────────────────────────────────
  // btemp2 - Body temperature
  // ───────────────────────────────────────────────────────────

  /**
   * Payload: btemp2,<unknown flag>,temperatureCelsius
   */
  private handleTemperature(client: TcpClient, packet: ParsedPacket): void {
    Logging.info(
      `btemp2 packet received from device ${packet.deviceId}: ${packet.payload}`
    );

    const parts = packet.payload.split(",");
    const temperature = parseFloat(parts[1]);

    if (isNaN(temperature)) return;

    this.saveHealthMetric(
      packet.deviceId,
      "temperature",
      temperature,
      null,
      "C",
      new Date()
    ).catch((error: Error) =>
      Logging.error(
        `Failed to save temperature for device ${packet.deviceId}: ${error.message}`
      )
    );
  }

  // ───────────────────────────────────────────────────────────
  // calllog - Call log entry
  // ───────────────────────────────────────────────────────────

  /**
   * Payload: calllog,phoneNumber,,type,flag,unixTimestamp,durationSeconds
   *
   * There is no dedicated call-log table, so this is stored as a
   * Notification (generic, already surfaced to the app) rather than
   * dropped.
   */
  private handleCallLog(client: TcpClient, packet: ParsedPacket): void {
    Logging.info(
      `calllog packet received from device ${packet.deviceId}: ${packet.payload}`
    );

    const parts = packet.payload.split(",");
    const phoneNumber = parts[0] || "unknown";

    this.findDevice(packet.deviceId)
      .then((device) => {
        if (!device) return;

        return db.Notification.create({
          device_id: device.id,
          user_id: null,
          type: "general",
          title: "Call log",
          body: phoneNumber,
          metadata: { kind: "call_log", raw: packet.payload, fields: parts },
          is_read: "0",
        });
      })
      .catch((error: Error) =>
        Logging.error(
          `Failed to save call log for device ${packet.deviceId}: ${error.message}`
        )
      );
  }

  // ───────────────────────────────────────────────────────────
  // CONFIG - Device configuration dump
  // ───────────────────────────────────────────────────────────

  /**
   * Payload is a long key:value,key:value list. We only trust the
   * upload interval (UL, in seconds) since it maps directly onto an
   * existing Device field; the rest is logged raw (already done by
   * the caller logging packet.raw) rather than guessed at.
   */
  private handleConfig(client: TcpClient, packet: ParsedPacket): void {
    Logging.info(`CONFIG packet received from device ${packet.deviceId}`);

    const uploadSecondsMatch = packet.payload.match(/(?:^|,)UL:(\d+)/);

    if (!uploadSecondsMatch) return;

    const uploadMinutes = Math.round(parseInt(uploadSecondsMatch[1], 10) / 60);

    if (!Number.isInteger(uploadMinutes) || uploadMinutes <= 0) return;

    this.findDevice(packet.deviceId)
      .then((device) => {
        if (!device) return;

        return device.update({ location_interval_minutes: uploadMinutes });
      })
      .catch((error: Error) =>
        Logging.error(
          `Failed to update config for device ${packet.deviceId}: ${error.message}`
        )
      );
  }

  // ───────────────────────────────────────────────────────────
  // CS - Scene Mode Response
  // ───────────────────────────────────────────────────────────

  /**
   * Device response after receiving scene mode command.
   *
   * Server sends: [CS*YYYYYYYYYY*LEN*profile,x]
   * Device responds: [CS*YYYYYYYYYY*LEN*profile]
   *
   * This handler processes the device's acknowledgment.
   */
  private handleSceneModeResponse(
    client: TcpClient,
    packet: ParsedPacket
  ): void {
    Logging.info(
      `Scene mode response received from device ${packet.deviceId}: ${packet.raw}`
    );

    // Device acknowledged the scene mode command
    // You can update database or trigger callbacks here if needed
    this.findDevice(packet.deviceId)
      .then((device) => {
        if (!device) return;

        // Optionally save a notification that scene mode was applied
        return db.Notification.create({
          device_id: device.id,
          user_id: null,
          type: "general",
          title: "Scene mode applied",
          body: `Device ${packet.deviceId} acknowledged scene mode change`,
          metadata: { kind: "scene_mode", deviceId: packet.deviceId },
          is_read: "0",
        });
      })
      .catch((error: Error) =>
        Logging.error(
          `Failed to save scene mode notification for device ${packet.deviceId}: ${error.message}`
        )
      );
  }

  // ───────────────────────────────────────────────────────────
  // ICCID / RYIMEI - Device identity
  // ───────────────────────────────────────────────────────────

  /**
   * Payload: ICCID,iccid,imei,imsi,
   */
  private handleIccid(client: TcpClient, packet: ParsedPacket): void {
    Logging.info(
      `ICCID packet received from device ${packet.deviceId}: ${packet.payload}`
    );

    const parts = packet.payload.split(",");
    const imei = parts[1];

    if (imei) {
      this.linkDeviceIdentity(packet.deviceId, imei);
    }
  }

  /**
   * Payload: RYIMEI,imei
   */
  private handleRyimei(client: TcpClient, packet: ParsedPacket): void {
    Logging.info(
      `RYIMEI packet received from device ${packet.deviceId}: ${packet.payload}`
    );

    const imei = packet.payload.split(",")[0];

    if (imei) {
      client.imei = imei;

      this.linkDeviceIdentity(packet.deviceId, imei);
    }
  }

  // ───────────────────────────────────────────────────────────
  // TS - Device Status / Terminal Status
  // ───────────────────────────────────────────────────────────

  /**
   * Device response after the server sends a TS (terminal status)
   * query command.
   *
   * Server sends:  [3G*YYYYYYYYYY*0002*TS]
   * Device replies: [3G*YYYYYYYYYY*LEN*TS,ver:...;ID:...;imei:...;...]
   *
   * The payload is a semicolon-delimited list of key:value pairs.
   * We parse it, persist the relevant fields to the Device record,
   * and log the raw data for diagnostics.
   */
  private handleDeviceStatusResponse(
    client: TcpClient,
    packet: ParsedPacket
  ): void {
    Logging.info(
      `TS device status response received from device ${packet.deviceId}: ${packet.payload}`
    );

    const status = this.parseDeviceStatus(packet.payload);

    if (!status) {
      Logging.error(
        `Unable to parse TS device status response from device ${packet.deviceId}`
      );

      return;
    }

    Logging.info(
      `DEVICE STATUS | Device: ${packet.deviceId} | ` +
        `Firmware: ${status.ver} | ` +
        `Battery: ${status.batlevel} | ` +
        `GPS: ${status.gps} | ` +
        `NET: ${status.net}`
    );

    this.saveDeviceStatus(packet.deviceId, status).catch((error: Error) =>
      Logging.error(
        `Failed to save device status for ${packet.deviceId}: ${error.message}`
      )
    );
  }

  // ───────────────────────────────────────────────────────────
  // RESET - Device Restart
  // ───────────────────────────────────────────────────────────

  /**
   * Device response after the server sends a RESET (restart) command.
   *
   * Server sends:  [3G*YYYYYYYYYY*0005*RESET]
   * Device replies: [3G*YYYYYYYYYY*0005*RESET]
   *
   * The device acknowledges the restart command by echoing it back.
   * We log the acknowledgement and save a notification so the user
   * is informed that the restart was accepted by the device.
   */
  private handleRestartResponse(client: TcpClient, packet: ParsedPacket): void {
    Logging.info(
      `RESET restart response received from device ${packet.deviceId}: ${packet.raw}`
    );

    this.findDevice(packet.deviceId)
      .then((device) => {
        if (!device) return;

        return db.Notification.create({
          device_id: device.id,
          user_id: null,
          type: "general",
          title: "Device restart",
          body: `Device ${packet.deviceId} acknowledged restart command`,
          metadata: { kind: "restart", deviceId: packet.deviceId },
          is_read: "0",
        });
      })
      .catch((error: Error) =>
        Logging.error(
          `Failed to save restart notification for device ${packet.deviceId}: ${error.message}`
        )
      );
  }

  // ───────────────────────────────────────────────────────────
  // IMG - Image/Snapshot response from device
  // ───────────────────────────────────────────────────────────

  /**
   * Handle image data received from device after rcapture command.
   *
   * Protocol format: [3G*YYYYYYYYYY*len*img,x,y,z]
   * - x: Image type (5 = remote snapshot)
   * - y: Timestamp (YYMMDDHHmmss format, e.g., 160429110950)
   * - z: Image data in hex format (needs to be converted to JPEG)
   */
  private handleImageResponse(client: TcpClient, packet: ParsedPacket): void {
    Logging.info(
      `Image data received from device ${
        packet.deviceId
      }: ${packet.payload.substring(0, 50)}...`
    );

    const parts = packet.payload.split(",");
    if (parts.length < 3) {
      Logging.error(`Invalid image payload from device ${packet.deviceId}`);
      return;
    }

    const imageType = parts[0]; // "5" for remote snapshot
    const timestamp = parts[1]; // YYMMDDHHmmss format
    const imageHexData = parts.slice(2).join(","); // Image hex data

    Logging.info(
      `Image type: ${imageType}, timestamp: ${timestamp}, data length: ${imageHexData.length}`
    );

    // Convert hex to binary and save as JPEG
    try {
      const imageBuffer = Buffer.from(imageHexData, "hex");

      // Generate filename from timestamp
      const filename = `snapshot_${packet.deviceId}_${timestamp}.jpg`;
      const filepath = `./uploads/snapshots/${filename}`;

      // Ensure directory exists
      const fs = require("fs");
      const path = require("path");
      const dir = path.dirname(filepath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Save the image
      fs.writeFileSync(filepath, imageBuffer);

      Logging.info(`Snapshot saved: ${filepath}`);

      // Save to database
      this.findDevice(packet.deviceId)
        .then((device) => {
          if (!device) return;

          return db.Snapshot.create({
            device_id: device.id,
            image_url: filename,
          });
        })
        .then(() => {
          Logging.info(`Snapshot record created for device ${packet.deviceId}`);
        })
        .catch((error: Error) =>
          Logging.error(
            `Failed to save snapshot for device ${packet.deviceId}: ${error.message}`
          )
        );
    } catch (error) {
      Logging.error(
        `Failed to process image from device ${packet.deviceId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Parse the semicolon-delimited key:value payload returned by the
   * device in response to a TS command.
   *
   * Example payload:
   *   ver:G4C_YSC_EMMC_240_5M_En_N_2023.11.10_15.38.00;
   *   ID:8800000015;
   *   imei:861234000000001;
   *   url:52.18.132.157; port:8001;
   *   upload:600; lk:300;
   *   batlevel:87;
   *   language:en; zone:+01:00;
   *   profile:1;
   *   GPS:OK(0);
   *   wifiOpen:false; wifiConnect:false;
   *   gprsOpen:true;
   *   NET:OK(100)
   *
   * Some values carry inline annotations in parentheses, e.g.
   * "GPS:OK(0)" or "NET:OK(100)".  We keep the raw value and also
   * extract the parenthesised detail where present.
   */
  private parseDeviceStatus(payload: string): DeviceStatus | null {
    if (!payload || !payload.trim()) {
      return null;
    }

    const result: DeviceStatus = {};

    /**
     * Split on semicolons.  Some values may contain commas inside
     * parentheses (e.g. "profile:1; (1-vibration and ringing,...)"),
     * but the semicolon is always the top-level delimiter.
     */
    const pairs = payload.split(";");

    for (const pair of pairs) {
      const trimmed = pair.trim();

      if (!trimmed) continue;

      /**
       * Skip fragments that are pure comments, e.g.
       * "(1-vibration and ringing,refer to 30.Scence mode)"
       */
      if (trimmed.startsWith("(")) continue;

      const colonIndex = trimmed.indexOf(":");

      if (colonIndex === -1) continue;

      const key = trimmed.substring(0, colonIndex).trim();
      const value = trimmed.substring(colonIndex + 1).trim();

      if (!key) continue;

      result[key] = value;
    }

    return result;
  }

  /**
   * Persist the parsed device status to the Device record (and
   * DeviceSetting for the scene-mode profile).
   */
  private async saveDeviceStatus(
    deviceId: string,
    status: DeviceStatus
  ): Promise<void> {
    const device = await this.findDevice(deviceId);

    if (!device) return;

    const updates: any = {
      last_updated_at: new Date(),
      is_online: true,
      connection_status: "online",
    };

    /**
     * Firmware version
     */
    if (status.ver) {
      updates.firmware_version = status.ver;
    }

    /**
     * Battery level (percentage)
     */
    if (status.batlevel) {
      const battery = parseInt(status.batlevel, 10);

      if (!isNaN(battery) && battery >= 0 && battery <= 100) {
        updates.battery_percentage = battery;
      }
    }

    /**
     * Upload interval (seconds → minutes)
     */
    if (status.upload) {
      const uploadSeconds = parseInt(status.upload, 10);

      if (!isNaN(uploadSeconds) && uploadSeconds > 0) {
        updates.location_interval_minutes = Math.round(uploadSeconds / 60);
      }
    }

    /**
     * Heartbeat / link interval (seconds)
     */
    if (status.lk) {
      const lkSeconds = parseInt(status.lk, 10);

      if (!isNaN(lkSeconds) && lkSeconds > 0) {
        updates.heartbeat_interval_seconds = lkSeconds;
      }
    }

    /**
     * Language
     */
    if (status.language) {
      updates.language = status.language;
    }

    /**
     * Timezone / zone
     */
    if (status.zone) {
      updates.timezone = status.zone;
    }

    /**
     * GPS status — e.g. "OK(0)"
     */
    if (status.GPS) {
      updates.gps_status = status.GPS;
    }

    /**
     * Network status — e.g. "OK(100)"
     */
    if (status.NET) {
      updates.network_status = status.NET;
      updates.signal_status = status.NET;
    }

    /**
     * WiFi
     */
    if (status.wifiOpen !== undefined) {
      updates.wifi_enabled = status.wifiOpen === "true";
    }

    if (status.wifiConnect !== undefined) {
      updates.wifi_connected = status.wifiConnect === "true";
    }

    /**
     * GPRS
     */
    if (status.gprsOpen !== undefined) {
      updates.gprs_enabled = status.gprsOpen === "true";
    }

    await device.update(updates);

    /**
     * Update scene mode in DeviceSetting if profile is present.
     */
    if (status.profile) {
      const profile = parseInt(status.profile, 10);

      if (!isNaN(profile) && [1, 2, 3, 4].includes(profile)) {
        try {
          let deviceSetting = await db.DeviceSetting.findOne({
            where: { device_id: device.id },
          });

          if (deviceSetting) {
            deviceSetting.scene_mode = profile;
            await deviceSetting.save();
          } else {
            await db.DeviceSetting.create({
              device_id: device.id,
              sms_alert_enabled: "0",
              take_off_device_alert: "0",
              safe_mode: "0",
              talking_clock: "0",
              night_power_saving: "0",
              volume: 50,
              brightness: 50,
              fall_down_alert_enabled: true,
              fall_down_reminder_call: true,
              fall_down_level: 5,
              scene_mode: profile,
            });
          }
        } catch (settingErr) {
          Logging.error(
            `Failed to update scene_mode from TS profile for device ${deviceId}: ${settingErr}`
          );
        }
      }
    }
  }

  /**
   * The bracket protocol's deviceId is a short serial, not the real
   * IMEI a Device is registered with. Once we learn the real IMEI
   * (via ICCID/RYIMEI), find the Device by that IMEI and backfill
   * its serial_number with the short protocol ID, so future packets
   * -- which only ever carry the short ID -- can be matched via
   * findDevice() without waiting for another ICCID/RYIMEI packet.
   *
   * If no Device is found by IMEI, we also check for a placeholder
   * Device that was auto-created by findDevice() (identified by
   * serial_number = deviceId and imei = null). If found, we update
   * its imei so it becomes a fully registered device.
   */
  private async linkDeviceIdentity(
    deviceId: string,
    imei: string
  ): Promise<void> {
    let device = await db.Device.findOne({ where: { imei } });

    if (!device) {
      /**
       * No device found by IMEI. Check if there is a placeholder
       * device that was auto-created for this protocol deviceId.
       */
      device = await db.Device.findOne({
        where: { serial_number: deviceId, imei: null },
      });
    }

    if (!device) {
      Logging.info(
        `No registered Device found for imei ${imei} (protocol id ${deviceId}) - ` +
          `creating placeholder.`
      );

      try {
        device = await db.Device.create({
          serial_number: deviceId,
          imei: imei,
          owner_id: null,
          device_name: `Device ${deviceId}`,
          email: `${deviceId}@placeholder.local`,
          phone_number: null,
          country_code: null,
          network_carrier: null,
          network_type: null,
          profile_image: null,
          connection_status: "offline",
          signal_status: null,
          battery_percentage: null,
          gps_strength: null,
          is_online: false,
          last_updated_at: null,
          location_interval_minutes: 1,
          height_cm: null,
          gender: null,
          age: null,
          weight_kg: null,
        });

        Logging.info(
          `Placeholder Device created for protocol id ${deviceId} ` +
            `with imei ${imei} (DB id: ${device.id})`
        );
      } catch (error: any) {
        Logging.error(
          `Failed to create placeholder Device for ${deviceId}: ` +
            `${error.message}`
        );
        return;
      }
    }

    const updates: any = {};

    if (device.imei !== imei) {
      updates.imei = imei;
    }

    if (device.serial_number !== deviceId) {
      updates.serial_number = deviceId;
    }

    if (Object.keys(updates).length > 0) {
      await device.update(updates);

      Logging.info(
        `Device ${device.id} linked: imei=${imei}, ` +
          `serial_number=${deviceId}`
      );
    }
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
  // Database persistence
  // ───────────────────────────────────────────────────────────

  /**
   * The bracket protocol identifies devices by a short "deviceId"
   * field in [3G*deviceId*len*content] - this is NOT the same as the
   * real IMEI a Device is registered with (which only arrives later,
   * via ICCID/RYIMEI packets - see linkDeviceIdentity()).
   *
   * We match primarily on Device.serial_number (backfilled from
   * ICCID/RYIMEI), falling back to Device.imei. If neither matches,
   * we auto-create a placeholder Device so that incoming data is not
   * lost. The placeholder has:
   *   - serial_number = the short protocol deviceId
   *   - imei = null (filled later via ICCID/RYIMEI)
   *   - owner_id = null (assigned later via admin API)
   */
  private async findDevice(deviceId: string): Promise<any | null> {
    let device = await db.Device.findOne({
      where: { serial_number: deviceId },
    });

    if (!device) {
      device = await db.Device.findOne({ where: { imei: deviceId } });
    }

    if (!device) {
      Logging.info(
        `No registered Device found for protocol id ${deviceId} - ` +
          `creating placeholder.`
      );

      try {
        device = await db.Device.create({
          serial_number: deviceId,
          imei: null,
          owner_id: null,
          device_name: `Device ${deviceId}`,
          email: `${deviceId}@placeholder.local`,
          phone_number: null,
          country_code: null,
          network_carrier: null,
          network_type: null,
          profile_image: null,
          connection_status: "offline",
          signal_status: null,
          battery_percentage: null,
          gps_strength: null,
          is_online: false,
          last_updated_at: null,
          location_interval_minutes: 1,
          height_cm: null,
          gender: null,
          age: null,
          weight_kg: null,
        });

        Logging.info(
          `Placeholder Device created for protocol id ${deviceId} ` +
            `(DB id: ${device.id})`
        );
      } catch (error: any) {
        Logging.error(
          `Failed to create placeholder Device for ${deviceId}: ` +
            `${error.message}`
        );
        return null;
      }
    }

    return device;
  }

  private async markDeviceOnline(deviceId: string): Promise<void> {
    const device = await this.findDevice(deviceId);

    if (!device) return;

    /**
     * Real device traffic (LK,0,0,57) doesn't match the
     * battery,step,turnovers layout we originally assumed - the
     * last field lines up with GSM signal in UD_LTE instead. Rather
     * than keep guessing and writing a wrong battery %, LK now only
     * updates online status; battery comes from UD_LTE, which
     * reports it at a confirmed field position.
     */
    await device.update({
      is_online: true,
      connection_status: "online",
      last_updated_at: new Date(),
    });
  }

  private async markDeviceOffline(deviceId: string): Promise<void> {
    const device = await this.findDevice(deviceId);

    if (!device) return;

    await device.update({
      is_online: false,
      connection_status: "offline",
      last_updated_at: new Date(),
    });
  }

  /**
   * Converts "ddmm.mmmm" (degrees + minutes) to decimal degrees,
   * applying sign for S/W directions. This is the coordinate format
   * used by the NMEA-derived GPS watch protocols in this family.
   */
  private convertCoordinate(raw: string, direction: string): number | null {
    const value = parseFloat(raw);

    if (isNaN(value)) return null;

    const degrees = Math.floor(value / 100);
    const minutes = value - degrees * 100;
    const decimal = degrees + minutes / 60;

    return direction === "S" || direction === "W" ? -decimal : decimal;
  }

  /**
   * UD_LTE reports latitude/longitude as plain decimal degrees
   * already (unlike the plain UD command's ddmm.mm format) - only
   * the N/S/E/W sign needs applying.
   */
  private convertDecimalCoordinate(
    raw: string,
    direction: string
  ): number | null {
    const value = parseFloat(raw);

    if (isNaN(value)) return null;

    return direction === "S" || direction === "W" ? -value : value;
  }

  /**
   * Date/time fields are DDMMYY / HHMMSS (matches $GPRMC-derived
   * encoding used by this protocol family).
   */
  private parseRecordedAt(date: string, time: string): Date {
    if (date.length === 6 && time.length === 6) {
      const day = date.substring(0, 2);
      const month = date.substring(2, 4);
      const year = `20${date.substring(4, 6)}`;
      const hours = time.substring(0, 2);
      const minutes = time.substring(2, 4);
      const seconds = time.substring(4, 6);

      const parsed = new Date(
        `${year}-${month}-${day}T${hours}:${minutes}:${seconds}Z`
      );

      if (!isNaN(parsed.getTime())) return parsed;
    }

    return new Date();
  }

  private async saveLocation(
    deviceId: string,
    location: GpsLocation,
    networkType: string
  ): Promise<void> {
    const device = await this.findDevice(deviceId);

    if (!device) return;

    const latitude = this.convertCoordinate(
      location.latitude,
      location.latitudeDirection
    );
    const longitude = this.convertCoordinate(
      location.longitude,
      location.longitudeDirection
    );

    if (latitude === null || longitude === null) {
      Logging.error(
        `Could not convert coordinates for device ${deviceId}: ` +
          `${location.latitude}${location.latitudeDirection}, ` +
          `${location.longitude}${location.longitudeDirection}`
      );

      return;
    }

    await db.Location.create({
      device_id: device.id,
      latitude,
      longitude,
      speed_kmh: parseFloat(location.speed) || null,
      direction: location.direction || null,
      is_valid_fix: location.gpsStatus === "A",
      recorded_at: this.parseRecordedAt(location.date, location.time),
    });

    await device.update({
      last_updated_at: new Date(),
      gps_strength: parseInt(location.satellites, 10) >= 4 ? "strong" : "weak",
      network_type: networkType,
    });
  }

  private async saveHeartRate(
    deviceId: string,
    heartRate: { bpm: number; unit: string; recordedAt: Date }
  ): Promise<void> {
    const device = await this.findDevice(deviceId);

    if (!device) return;

    await db.HealthMetric.create({
      device_id: device.id,
      metric_type: "heart_rate",
      value_primary: heartRate.bpm,
      value_secondary: null,
      unit: heartRate.unit,
      recorded_at: heartRate.recordedAt,
    });
  }

  private async saveHealthMetric(
    deviceId: string,
    metricType: string,
    valuePrimary: number,
    valueSecondary: number | null,
    unit: string,
    recordedAt: Date
  ): Promise<void> {
    const device = await this.findDevice(deviceId);

    if (!device) return;

    const record = await db.HealthMetric.create({
      device_id: device.id,
      metric_type: metricType,
      value_primary: valuePrimary,
      value_secondary: valueSecondary,
      unit,
      recorded_at: recordedAt,
    });

    Logging.info(
      `HealthMetric saved | Device: ${deviceId} | Type: ${metricType} | ` +
        `Value: ${valuePrimary}${unit ? " " + unit : ""} | DB id: ${record.id}`
    );
  }

  private async saveAlarm(deviceId: string, payload: string): Promise<void> {
    const device = await this.findDevice(deviceId);

    if (!device) return;

    await db.Notification.create({
      device_id: device.id,
      user_id: null,
      type: "general",
      title: "Device alarm",
      body: payload,
      metadata: { kind: "alarm", raw: payload },
      is_read: "0",
    });
  }

  // ───────────────────────────────────────────────────────────
  // Send data to device
  // ───────────────────────────────────────────────────────────

  private send(client: TcpClient, message: string): void {
    if (client.socket.destroyed) {
      Logging.error(`Cannot send to disconnected device: ${client.id}`);

      return;
    }

    // Add newline terminator - GPS devices expect \n to know command is complete
    client.socket.write(message + "\n");
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
  // Send Scene Mode command to device
  // ───────────────────────────────────────────────────────────

  /**
   * Send scene mode command to a specific device.
   *
   * Protocol format: [CS*YYYYYYYYYY*LEN*profile,x]
   *
   * Scene modes:
   * - 1: Vibration and ringing
   * - 2: Ringing only
   * - 3: Vibration only
   * - 4: Silence
   *
   * @param deviceId - The device ID (e.g., 8800000015)
   * @param sceneMode - The scene mode (1, 2, 3, or 4)
   * @returns true if command sent successfully, false if device not connected
   */
  public sendSceneModeCommand(deviceId: string, sceneMode: number): boolean {
    // Validate scene mode
    if (![1, 2, 3, 4].includes(sceneMode)) {
      Logging.error(`Invalid scene mode: ${sceneMode}. Must be 1, 2, 3, or 4.`);
      return false;
    }

    const client = this.devices.get(deviceId);

    if (!client) {
      Logging.error(
        `Device ${deviceId} is not connected. Cannot send scene mode command.`
      );
      return false;
    }

    // Calculate length: "profile,X" where X is the scene mode
    const payload = `profile,${sceneMode}`;
    const length = payload.length.toString().padStart(4, "0");

    // Build the command packet
    const command = `[CS*${deviceId}*${length}*${payload}]`;

    Logging.info(
      `Sending scene mode command to device ${deviceId}: ${command}`
    );

    this.send(client, command);

    return true;
  }

  // ───────────────────────────────────────────────────────────
  // Send Device Status (TS) command to device
  // ───────────────────────────────────────────────────────────

  /**
   * Send a TS (terminal status) query command to a specific device.
   *
   * Protocol format: [3G*YYYYYYYYYY*0002*TS]
   *
   * The device will respond with a TS packet containing its current
   * firmware version, battery level, GPS/network status, WiFi/GPRS
   * state, upload & heartbeat intervals, language, timezone, and
   * scene-mode profile.
   *
   * @param deviceId - The device ID (e.g. 8800000015)
   * @returns true if command sent successfully, false if device not connected
   */
  public sendDeviceStatusCommand(deviceId: string): boolean {
    const client = this.devices.get(deviceId);

    if (!client) {
      Logging.error(
        `Device ${deviceId} is not connected. Cannot send TS command.`
      );

      return false;
    }

    const command = `[3G*${deviceId}*0002*TS]`;

    Logging.info(
      `Sending device status (TS) command to device ${deviceId}: ${command}`
    );

    this.send(client, command);

    return true;
  }

  // ───────────────────────────────────────────────────────────
  // Send Restart (RESET) command to device
  // ───────────────────────────────────────────────────────────

  /**
   * Send a RESET (restart) command to a specific device.
   *
   * Protocol format: [3G*YYYYYYYYYY*0005*RESET]
   *
   * The device will restart and, upon coming back online, will
   * re-establish its TCP connection and resume sending heartbeats.
   *
   * @param deviceId - The device ID (e.g. 8800000015)
   * @returns true if command sent successfully, false if device not connected
   */
  public sendRestartCommand(deviceId: string): boolean {
    const client = this.devices.get(deviceId);

    if (!client) {
      Logging.error(
        `Device ${deviceId} is not connected. Cannot send RESET command.`
      );

      return false;
    }

    const command = `[3G*${deviceId}*0005*RESET]`;

    Logging.info(
      `Sending restart (RESET) command to device ${deviceId}: ${command}`
    );

    this.send(client, command);

    return true;
  }

  // ───────────────────────────────────────────────────────────
  // Send Shutdown (POWEROFF) command to device
  // ───────────────────────────────────────────────────────────

  /**
   * Send a POWEROFF (shutdown) command to a specific device.
   *
   * Protocol format: [CS*YYYYYYYYYY*LEN*POWEROFF]
   *
   * Example: [3G*5678901234*0008*POWEROFF]
   *
   * The device will shut down and disconnect from the network.
   *
   * @param deviceId - The device ID (e.g. 8800000015)
   * @returns true if command sent successfully, false if device not connected
   */
  public sendShutdownCommand(deviceId: string): boolean {
    const client = this.devices.get(deviceId);

    if (!client) {
      Logging.error(
        `Device ${deviceId} is not connected. Cannot send POWEROFF command.`
      );

      return false;
    }

    // Calculate length: "POWEROFF" has 8 characters
    const command = `[CS*${deviceId}*0008*POWEROFF]`;

    Logging.info(
      `Sending shutdown (POWEROFF) command to device ${deviceId}: ${command}`
    );

    this.send(client, command);

    return true;
  }

  // ───────────────────────────────────────────────────────────
  // Send Factory Reset (FACTORY) command to device
  // ───────────────────────────────────────────────────────────

  /**
   * Send a FACTORY (factory reset) command to a specific device.
   *
   * Protocol format: [CS*YYYYYYYYYY*LEN*FACTORY]
   *
   * Example: [3G*8800000015*0007*FACTORY]
   *
   * The device will perform a factory reset and restore default settings.
   *
   * @param deviceId - The device ID (e.g. 8800000015)
   * @returns true if command sent successfully, false if device not connected
   */
  public sendFactoryCommand(deviceId: string): boolean {
    const client = this.devices.get(deviceId);

    if (!client) {
      Logging.error(
        `Device ${deviceId} is not connected. Cannot send FACTORY command.`
      );

      return false;
    }

    // Calculate length: "FACTORY" has 7 characters
    const command = `[CS*${deviceId}*0007*FACTORY]`;

    Logging.info(
      `Sending factory reset (FACTORY) command to device ${deviceId}: ${command}`
    );

    this.send(client, command);

    return true;
  }

  // ───────────────────────────────────────────────────────────
  // Send Find Device command to device
  // ───────────────────────────────────────────────────────────

  /**
   * Send a FIND command to a specific device.
   *
   * Protocol format: [CS*YYYYYYYYYY*LEN*FIND]
   *
   * Example: [3G*5678901234*0004*FIND]
   *
   * The device will respond with its location or an audible alert
   * to help locate it.
   *
   * @param deviceId - The device ID (e.g. 8800000015)
   * @returns true if command sent successfully, false if device not connected
   */
  public sendFindCommand(deviceId: string): boolean {
    const client = this.devices.get(deviceId);

    if (!client) {
      Logging.error(
        `Device ${deviceId} is not connected. Cannot send FIND command.`
      );

      return false;
    }

    // Calculate length: "FIND" has 4 characters
    const command = `[CS*${deviceId}*0004*FIND]`;

    Logging.info(
      `Sending find device (FIND) command to device ${deviceId}: ${command}`
    );

    this.send(client, command);

    return true;
  }

  // ───────────────────────────────────────────────────────────
  // Send Alarm (REMIND) command to device
  // ───────────────────────────────────────────────────────────

  /**
   * Send alarm clock settings to a specific device.
   *
   * Protocol format: [CS*YYYYYYYYYY*LEN*REMIND,alarm1,alarm2,alarm3]
   *
   * Alarm format: HH:MM-type-repeat-days
   * - HH:MM: Time in 24-hour format
   * - type: Alarm type (1=once, 2=daily, 3=weekly)
   * - repeat: Repeat count
   * - days: Days of week (7 chars, 0=Sun, 1=Mon, etc.) e.g., "0111110" = Mon-Fri
   *
   * Example: [3G*5678901234*0018*REMIND,08:10-1-1,08:10-1-2,08:10-1-3-0111110]
   *
   * @param deviceId - The device ID (e.g. 8800000015)
   * @param alarms - Array of alarm strings (e.g., ["08:10-1-1", "08:10-1-2", "08:10-1-3-0111110"])
   * @returns true if command sent successfully, false if device not connected
   */
  public sendAlarmCommand(deviceId: string, alarms: string[]): boolean {
    const client = this.devices.get(deviceId);

    if (!client) {
      Logging.error(
        `Device ${deviceId} is not connected. Cannot send REMIND command.`
      );

      return false;
    }

    // Build the alarm command payload
    const alarmPayload = alarms.join(",");
    const content = `REMIND,${alarmPayload}`;

    // Calculate length: content length (REMIND, + alarms)
    const length = content.length.toString().padStart(4, "0");
    const command = `[CS*${deviceId}*${length}*${content}]`;

    Logging.info(
      `Sending alarm (REMIND) command to device ${deviceId}: ${command}`
    );

    this.send(client, command);

    return true;
  }

  // ───────────────────────────────────────────────────────────
  // Send Remote Snapshot (rcapture) command to device
  // ───────────────────────────────────────────────────────────

  /**
   * Send a remote snapshot (rcapture) command to a specific device.
   *
   * Protocol format: [CS*YYYYYYYYYY*LEN*rcapture]
   *
   * Example: [3G*8800000015*0008*rcapture]
   *
   * The device will capture a photo and send it back as:
   * [3G*YYYYYYYYYY*len*img,x,y,z]
   * - x: Image type (5 = remote snapshot)
   * - y: Timestamp (YYMMDDHHmmss format)
   * - z: Image data in hex format
   *
   * @param deviceId - The device ID (e.g. 8800000015)
   * @returns true if command sent successfully, false if device not connected
   */
  public sendCaptureCommand(deviceId: string): boolean {
    const client = this.devices.get(deviceId);

    if (!client) {
      Logging.error(
        `Device ${deviceId} is not connected. Cannot send rcapture command.`
      );

      return false;
    }

    // Calculate length: "rcapture" has 8 characters
    const command = `[CS*${deviceId}*0008*rcapture]`;

    Logging.info(
      `Sending remote snapshot (rcapture) command to device ${deviceId}: ${command}`
    );

    this.send(client, command);

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

  battery?: string;
  gsmSignal?: string;

  rawFields: string[];
}

/**
 * Parsed key:value pairs from a TS (terminal status) device response.
 *
 * The device returns a semicolon-delimited list of key:value pairs.
 * We store every recognised key as an optional string property so
 * that callers can safely access any field without runtime errors.
 */
interface DeviceStatus {
  ver?: string;
  ID?: string;
  imei?: string;
  url?: string;
  port?: string;
  upload?: string;
  lk?: string;
  batlevel?: string;
  language?: string;
  zone?: string;
  profile?: string;
  GPS?: string;
  wifiOpen?: string;
  wifiConnect?: string;
  gprsOpen?: string;
  NET?: string;
  [key: string]: string | undefined;
}

export default TcpServer;
