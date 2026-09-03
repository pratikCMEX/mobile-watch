import net from "net";
import path from "path";
import fs from "fs";
import Logging from "../library/Logging";
import db from "../models";

// ─────────────────────────────────────────────────────────────
// Snapshot storage (absolute path so it works regardless of CWD
// — same convention as app/middleware/Multer.ts and app.ts).
// ─────────────────────────────────────────────────────────────
const SNAPSHOTS_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "uploads",
  "snapshots"
);
const ensureDir = (dir: string) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};
ensureDir(SNAPSHOTS_DIR);

// ─────────────────────────────────────────────────────────────
// Optional JPEG normalization via ffmpeg
//
// Some watch firmwares emit JPEGs that Chrome/ImageMagick open fine
// but Android's BitmapFactory / iOS UIImage choke on ("image
// decompress error"). The most common causes are:
//   1. progressive-scan JPEGs (cheap firmware cams love these)
//   2. missing/garbled EXIF / JFIF APP0 segment
//   3. unusual chroma subsampling or quantization tables
//
// Setting SNAPSHOT_NORMALIZE_FFMPEG=true makes the server pipe the
// saved JPEG through `ffmpeg` to produce a baseline, standard JFIF
// JPEG that every mobile decoder accepts. The original file is
// kept as `<name>.original.jpg` for forensics.
//
// If ffmpeg isn't installed, we log a warning once and fall back
// to writing the raw bytes as-is — so this is safe to leave on.
// ─────────────────────────────────────────────────────────────
const { execFile } = require("child_process");
const NORMALIZE_FFMPEG =
  String(process.env.SNAPSHOT_NORMALIZE_FFMPEG || "").toLowerCase() === "true";

/**
 * Try to re-encode the JPEG using ffmpeg into a baseline JFIF JPEG.
 * Returns the final on-disk path (always equal to `filepath` on
 * success or ffmpeg-missing; never throws).
 */
async function maybeNormalizeJpeg(filepath: string): Promise<string> {
  if (!NORMALIZE_FFMPEG) return filepath;

  const original = filepath.replace(/\.jpg$/i, ".original.jpg");
  try {
    fs.renameSync(filepath, original);
  } catch (e: any) {
    Logging.warn(
      `[SNAPSHOT] Could not move ${filepath} → ${original}: ${e?.message || e}`
    );
    return filepath;
  }

  return new Promise<string>((resolve) => {
    // -y            overwrite output
    // -i <in>       input file
    // -vf "..."     video filter chain
    //   scale=trunc(iw/2)*2:trunc(ih/2)*2   ensure even dimensions
    //                                        (ffmpeg requires even w/h
    //                                         for yuvj420p)
    //   format=yuvj420p                       full-range 4:2:0 chroma
    //                                        (universally supported)
    // -q:v 2        high-quality JPEG (qscale 2 = ~90% quality)
    // -compression_level 6   balanced
    const args = [
      "-y",
      "-i",
      original,
      "-vf",
      "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuvj420p",
      "-q:v",
      "2",
      filepath,
    ];

    execFile(
      "ffmpeg",
      args,
      { timeout: 20_000, maxBuffer: 4 * 1024 * 1024 },
      (err: any, stdout: string, stderr: string) => {
        if (err) {
          // ffmpeg missing or failed → restore the original bytes
          // so the user still gets a viewable file.
          Logging.warn(
            `[SNAPSHOT] ffmpeg normalize failed for ${filepath}: ` +
              (err?.message || err) +
              `. Falling back to the raw bytes.`
          );
          try {
            fs.copyFileSync(original, filepath);
          } catch (e: any) {
            Logging.error(
              `[SNAPSHOT] Could not restore original after ffmpeg failure: ` +
                (e?.message || e)
            );
          }
          resolve(filepath);
          return;
        }
        try {
          const stat = fs.statSync(filepath);
          Logging.info(
            `[SNAPSHOT] ffmpeg normalized ${filepath} → ${stat.size} bytes`
          );
        } catch {
          // ignore
        }
        resolve(filepath);
      }
    );
  });
}

// ─────────────────────────────────────────────────────────────
// Protocol escape codec
//
// Per the GPS protocol spec, image and voice data use a byte-level
// escape encoding so that the special bytes 0x7D, 0x5B, 0x5D, 0x2C,
// 0x2A can travel through the [ … ] delimited packet format.
//
// Wire (escaped) form  →  Decoded form
//      0x7D 0x01       →     0x7D
//      0x7D 0x02       →     0x5B     '['
//      0x7D 0x03       →     0x5D     ']'
//      0x7D 0x04       →     0x2C     ','
//      0x7D 0x05       →     0x2A     '*'
//
// (Note: voice/AMR packets use the SAME table. Both directions —
// device→server and server→device — apply this transform.)
//
// We use this for image-region decoding. A 0x7D byte that is NOT
// immediately followed by 0x01-0x05 is left as-is (defensive).
// ─────────────────────────────────────────────────────────────

const ESCAPE = 0x7d;

function decodeEscapeSequence(
  buf: Buffer,
  start: number,
  out: number[]
): number {
  // buf[start] === 0x7D; buf[start+1] is the second byte.
  const next = buf[start + 1];
  switch (next) {
    case 0x01:
      out.push(0x7d);
      return 2;
    case 0x02:
      out.push(0x5b);
      return 2;
    case 0x03:
      out.push(0x5d);
      return 2;
    case 0x04:
      out.push(0x2c);
      return 2;
    case 0x05:
      out.push(0x2a);
      return 2;
    default:
      // Not a recognised escape — leave the 0x7D byte verbatim.
      out.push(0x7d);
      return 1;
  }
}

/**
 * Decode an escaped buffer (as sent over the wire) back to the
 * original bytes. Bytes are read left-to-right; every 0x7D is
 * treated as an escape introducer and the following byte is
 * inspected.  Unknown escape sequences fall back to leaving 0x7D
 * verbatim so we never silently drop data.
 */
function unescape(buf: Buffer): Buffer {
  const out: number[] = [];
  for (let i = 0; i < buf.length; ) {
    if (buf[i] === ESCAPE && i + 1 < buf.length) {
      i += decodeEscapeSequence(buf, i, out);
    } else {
      out.push(buf[i]);
      i += 1;
    }
  }
  return Buffer.from(out);
}

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
        // Use latin1 encoding to preserve binary data (JPEG images)
        // utf8 would corrupt bytes that are not valid UTF-8 sequences
        buffer += data.toString("latin1");

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
          // Check if this is an image packet (contains binary data)
          if (packet.match(/^\[3G\*\d+\*[0-9A-Fa-f]+\*img,/)) {
            // Handle image packet specially
            this.handleRawImagePacket(client, packet);
          } else {
            this.handleMessage(client, packet);
          }
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

      // Check if this is an image packet (contains binary data)
      // Image packets have format: [3G*DEVICEID*LENGTH*img,TYPE,TIMESTAMP,DATA]
      // The LENGTH field tells us the exact packet length
      const imgMatch = buffer.match(/^\[3G\*(\d+)\*([0-9A-Fa-f]+)\*img,/);
      if (imgMatch) {
        // Parse the length as hex
        const packetLength = parseInt(imgMatch[2], 16);

        // Check if we have enough data for the full packet
        // +1 for the closing bracket
        if (buffer.length >= packetLength + 1) {
          // Slice exactly LEN bytes plus the closing "]" — DO NOT
          // .trim() here. The image region can legitimately end in
          // 0x20 (space), 0x0D, or 0x0A, and trimming would silently
          // eat the closing "]" and corrupt the byte-count framing
          // that the JPEG decoder relies on.
          const packet = buffer.slice(0, packetLength + 1);
          buffer = buffer.slice(packetLength + 1);

          if (packet.length > 0) {
            packets.push(packet);
          }
          continue;
        } else {
          // Packet is incomplete, wait for more data
          return {
            packets,
            remaining: buffer,
          };
        }
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
    Logging.info(
      `GPS packet from ${client.id}: ${message.substring(0, 80)}...`
    );

    // Check if this is an image packet (contains binary JPEG data)
    // Image packets start with [3G*DEVICEID*LENGTH*img,
    const imgMatch = message.match(/^\[3G\*(\d+)\*[0-9A-Fa-f]+\*img,/);
    if (imgMatch) {
      // Handle image packet directly without parsing (binary data breaks parser)
      const deviceId = imgMatch[1];
      client.deviceId = deviceId;

      // Extract payload after "img,"
      const imgPrefix = message.indexOf("*img,");
      const payload = message.substring(imgPrefix + 5);

      const parsed: ParsedPacket = {
        raw: message,
        manufacturer: "3G",
        deviceId: deviceId,
        length: message.split("*")[2],
        content: "img," + payload,
        command: "img",
        payload: payload,
      };

      this.handleImageResponse(client, parsed);
      return;
    }

    const parsed = this.parsePacket(message);

    if (!parsed) {
      Logging.error(
        `Invalid GPS packet from ${client.id}: ${message.substring(0, 80)}`
      );

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

      case "PHBX":
        this.handlePhonebookResponse(client, parsed);
        break;

      case "DPHBX":
        this.handleDeletePhonebookResponse(client, parsed);
        break;

      case "ACALL":
        this.handleAutoAnswerResponse(client, parsed);
        break;

      case "SOSSMS":
        this.handleSosSmsResponse(client, parsed);
        break;

      case "LZ":
        this.handleLzResponse(client, parsed);
        break;

      case "SILENCETIME":
        this.handleSilenceTimeResponse(client, parsed, "SILENCETIME");
        break;

      case "SILENCETIME2":
        this.handleSilenceTimeResponse(client, parsed, "SILENCETIME2");
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
      `[SNAPSHOT] handleImageResponse() called for device ${packet.deviceId} ` +
        `(raw packet length=${packet.raw.length} chars)`
    );
    // Defer all real work to the shared bulletproof parser.
    void this.processImagePacket(
      packet.raw,
      packet.deviceId,
      "handleImageResponse"
    );
    void client;
  }

  /**
   * Handle raw image packet from binary buffer data.
   *
   * This method processes image data directly from the TCP buffer
   * to avoid UTF-8 conversion corruption of binary JPEG data.
   *
   * Packet format: [3G*DEVICEID*LENGTH*img,TYPE,TIMESTAMP,BINARY_DATA]
   * - LENGTH: Hex length of the packet content (excluding brackets)
   * - TYPE: Image type (5 = remote snapshot)
   * - TIMESTAMP: YYMMDDHHmmss format
   * - BINARY_DATA: Raw JPEG image bytes
   */

  /**
   * Handle a PHBX response from the device.
   *
   * Per the spec, the device replies with:
   *   [3G*<id>*LEN*PHBX,<status>]
   *   status: 1 = success, 0 = failure
   *
   * In practice, the device on this firmware often replies with a
   * bare ACK containing just the command word and no status payload:
   *   [3G*<id>*0004*PHBX]
   *
   * That bare ACK means "I received the command" — we treat an empty
   * status payload as a successful ack (the contact was saved).
   * Only an explicit "0" status is treated as a failure.
   */
  private handlePhonebookResponse(
    client: TcpClient,
    packet: ParsedPacket
  ): void {
    const status = (packet.payload || "").trim();
    const ok = status === "" || status === "1";
    Logging.info(
      `PHBX response from device ${packet.deviceId}: status="${
        status || "(ack)"
      }" (${ok ? "OK" : "FAILED"})`
    );
    this.markDeviceOnline(packet.deviceId).catch((error: Error) =>
      Logging.error(
        `Failed to mark device ${packet.deviceId} online from PHBX: ${error.message}`
      )
    );
    void client;
  }

  /**
   * Handle a DPHBX response from the device.
   *
   * The device replies with the DPHBX command word (often with no
   * payload, just an ack):
   *   [3G*<id>*0005*DPHBX]            ← bare ack (success)
   *   [3G*<id>*0006*DPHBX,0]          ← explicit failure
   *
   * Empty payload = success.
   */
  private handleDeletePhonebookResponse(
    client: TcpClient,
    packet: ParsedPacket
  ): void {
    const status = (packet.payload || "").trim();
    const ok = status === "" || status === "1";
    Logging.info(
      `DPHBX response from device ${packet.deviceId}: status="${
        status || "(ack)"
      }" (${ok ? "OK" : "FAILED"})`
    );
    this.markDeviceOnline(packet.deviceId).catch((error: Error) =>
      Logging.error(
        `Failed to mark device ${packet.deviceId} online from DPHBX: ${error.message}`
      )
    );
    void client;
  }

  private handleRawImagePacket(client: TcpClient, rawPacket: string): void {
    Logging.info(
      `[SNAPSHOT] handleRawImagePacket() called for connection ${client.id} ` +
        `(raw packet length=${rawPacket.length} chars)`
    );

    // Parse the ASCII header just enough to learn the device id.
    // Do NOT search for the timestamp inside the binary region later.
    const headerMatch = rawPacket.match(/^\[3G\*(\d+)\*[0-9A-Fa-f]+\*img,/);
    const deviceId = headerMatch ? headerMatch[1] : undefined;
    if (deviceId) {
      client.deviceId = deviceId;
    }

    // Defer all real work to the shared bulletproof parser.
    void this.processImagePacket(rawPacket, deviceId, "handleRawImagePacket");
  }

  // ───────────────────────────────────────────────────────────
  // Shared image-packet processor (used by both handleImageResponse
  // and handleRawImagePacket). This is the ONLY place that writes
  // snapshot files and DB rows.
  // ───────────────────────────────────────────────────────────

  /**
   * Parse a complete image packet and persist the JPEG to disk + DB.
   *
   * Wire format (len excludes the brackets):
   *   [3G*<deviceId>*<len>*img,<type>,<12digits-timestamp>,<JPEG bytes>]
   *
   * Steps (each one is logged explicitly so you can see exactly
   * where it fails if anything goes wrong):
   *   1. Parse ASCII header up to (and including) the comma after
   *      the 12-digit timestamp — without any indexOf inside the
   *      binary region.
   *   2. Compute the JPEG byte range as the remainder of the
   *      packet minus the closing "]".
   *   3. Build a Buffer from that byte range using latin1
   *      (preserves bytes 0x00–0xFF 1:1).
   *   4. Validate the JPEG magic bytes (FF D8 FF).
   *   5. writeFileSync to <SNAPSHOTS_DIR>/snapshot_<id>_<ts>.jpg.
   *   6. findDevice() then Snapshot.create() with captured_at.
   *
   * Every error path logs the file path AND the row-level error
   * so the operator can see exactly what happened.
   */
  private async processImagePacket(
    rawPacket: string,
    fallbackDeviceId: string | undefined,
    source: "handleImageResponse" | "handleRawImagePacket"
  ): Promise<void> {
    const tag = `[SNAPSHOT:${source}]`;
    try {
      Logging.info(
        `${tag} step 1: received image packet, raw length=${rawPacket.length}`
      );

      // ── 1. Parse ASCII header up to the comma after the timestamp ──
      // Pattern is anchored to the start of the packet and matches
      // ONLY the ASCII portion (deviceId digits, 4-hex length, "img,",
      // one-char type, comma, 12-digit timestamp, comma). It does
      // NOT touch the binary region.
      const headerRe = /^\[3G\*(\d+)\*([0-9A-Fa-f]+)\*img,([^,]*),(\d{12}),/;
      const m = rawPacket.match(headerRe);
      if (!m) {
        Logging.error(
          `${tag} step 1 FAILED: header did not match expected pattern. ` +
            `First 80 chars: ${JSON.stringify(rawPacket.substring(0, 80))}`
        );
        return;
      }

      const deviceId = m[1];
      const packetLength = parseInt(m[2], 16); // bytes inside the brackets
      const imageType = m[3];
      const timestamp = m[4];

      Logging.info(
        `${tag} step 2: parsed header deviceId=${deviceId} type=${imageType} ` +
          `timestamp=${timestamp} packetLength=${packetLength} ` +
          `(expected raw length=${packetLength + 2})`
      );

      // ── 2. Compute the JPEG byte range ──
      // The match consumed everything up to and including the comma
      // right after the timestamp. m[0].length is the ASCII header
      // length in JS chars (= bytes for ASCII).
      const headerEnd = m[0].length;
      // The packet total = 1 ('[') + headerEnd_offset_to_closing
      // The closing "]" is at index `packetLength` from the start of
      // the packet content (after the opening "["). The full packet
      // is "[<content>]" where content length = packetLength, so the
      // closing "]" is at index packetLength + 1.
      const closingBracketAt = packetLength + 1;

      if (rawPacket.length < closingBracketAt) {
        Logging.error(
          `${tag} step 2 FAILED: packet shorter than declared LEN. ` +
            `raw.length=${rawPacket.length}, expected>=${closingBracketAt}`
        );
        return;
      }

      // Sanity check: the closing character really is "]". If it
      // isn't (e.g. upstream .trim() or framing drift stripped it),
      // RECOVER by trusting the declared packetLength — use the full
      // remainder of the buffer as the image region. This is what
      // the spec intends and is safer than refusing the packet.
      let regionEnd = closingBracketAt;
      if (rawPacket[closingBracketAt] !== "]") {
        Logging.warn(
          `${tag} step 2 WARNING: closing ']' missing at index ${closingBracketAt} ` +
            `(found ${JSON.stringify(rawPacket[closingBracketAt])}). ` +
            `Falling back to declared packetLength and using the rest ` +
            `of the buffer as the image region. raw length=${rawPacket.length}`
        );
        regionEnd = rawPacket.length;
      } else {
        // Skip past the closing "]" for the actual data slice
        // (substring is exclusive on the end index, so leave it as
        // closingBracketAt so we include everything up to but not
        // including "]").
      }

      const jpegCharCount = regionEnd - headerEnd;
      Logging.info(
        `${tag} step 3: JPEG region headerEnd=${headerEnd} regionEnd=${regionEnd} ` +
          `bytes=${jpegCharCount}`
      );

      // ── 3. Build the on-wire (escaped) image Buffer ──
      const escapedBuffer = Buffer.from(
        rawPacket.substring(headerEnd, regionEnd),
        "latin1"
      );
      Logging.info(
        `${tag} step 3: on-wire escaped region = ${escapedBuffer.length} bytes`
      );

      // ── 3b. Decode the escape sequences per the protocol spec ──
      // The device encodes 0x7D, 0x5B, 0x5D, 0x2C, 0x2A as 0x7D 0x0X.
      // Decoded output is the actual JPEG bytes.
      const jpegBuffer = unescape(escapedBuffer);
      Logging.info(
        `${tag} step 3b: decoded JPEG = ${jpegBuffer.length} bytes ` +
          `(removed ${escapedBuffer.length - jpegBuffer.length} escape bytes)`
      );

      // ── 4. Validate JPEG magic bytes (FF D8 FF) ──
      if (
        jpegBuffer.length < 4 ||
        jpegBuffer[0] !== 0xff ||
        jpegBuffer[1] !== 0xd8 ||
        jpegBuffer[2] !== 0xff
      ) {
        Logging.error(
          `${tag} step 4 FAILED: data does not start with JPEG magic bytes. ` +
            `First 8 bytes: ${Array.from(jpegBuffer.slice(0, 8))
              .map((b) => "0x" + b.toString(16).padStart(2, "0"))
              .join(" ")}` +
            ` — saved escape-decoded region to ` +
            (() => {
              try {
                const debugPath = path.join(
                  SNAPSHOTS_DIR,
                  `debug_${deviceId}_${timestamp}.bin`
                );
                fs.writeFileSync(debugPath, jpegBuffer);
                return debugPath;
              } catch {
                return "<debug-write-failed>";
              }
            })()
        );
        return;
      }

      // ── 5. Write file ──
      ensureDir(SNAPSHOTS_DIR);
      const filename = `snapshot_${deviceId}_${timestamp}.jpg`;
      const filepath = path.join(SNAPSHOTS_DIR, filename);

      try {
        fs.writeFileSync(filepath, jpegBuffer);
        const stat = fs.statSync(filepath);
        Logging.info(
          `${tag} step 5 OK: wrote ${stat.size} bytes to ${filepath}`
        );
      } catch (writeErr: any) {
        Logging.error(
          `${tag} step 5 FAILED: could not write file ${filepath}: ` +
            (writeErr?.message || String(writeErr))
        );
        return;
      }

      // ── 5b. Optional ffmpeg normalization (mobile-decoder safety) ──
      // If SNAPSHOT_NORMALIZE_FFMPEG=true and ffmpeg is on the PATH,
      // re-encode the saved JPEG as a baseline yuvj420p JFIF that
      // every Android/iOS decoder accepts. The raw bytes are kept as
      // <name>.original.jpg for forensics.
      if (NORMALIZE_FFMPEG) {
        const normalized = await maybeNormalizeJpeg(filepath);
        if (normalized !== filepath) {
          // shouldn't happen — maybeNormalizeJpeg resolves to filepath
          Logging.warn(
            `${tag} step 5b: unexpected normalized path ${normalized}`
          );
        }
      }

      // ── 6. Insert DB row ──
      try {
        const device = await this.findDevice(deviceId);
        if (!device) {
          Logging.error(
            `${tag} step 6 FAILED: no Device row found for deviceId=${deviceId} ` +
              `(file is on disk at ${filepath} but no DB row was created)`
          );
          return;
        }
        const row = await db.Snapshot.create({
          device_id: device.id,
          image_url: `/uploads/snapshots/${filename}`,
          captured_at: new Date(),
        });
        Logging.info(
          `${tag} step 6 OK: Snapshot row created id=${row.id} device_id=${device.id} ` +
            `image_url=${row.image_url}`
        );
      } catch (dbErr: any) {
        Logging.error(
          `${tag} step 6 FAILED: Snapshot.create() threw for device ${deviceId} ` +
            `(file IS on disk at ${filepath}): ` +
            (dbErr?.message || String(dbErr))
        );
      }
    } catch (error: any) {
      Logging.error(
        `${tag} UNCAUGHT: ${error?.message || String(error)}` +
          (error?.stack ? `\nStack: ${error.stack}` : "")
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
    // LEN is hex (same family as image packets which are received with
    // parseInt(..., 16)). Sending it as decimal mis-frames the packet.
    const length = payload.length.toString(16).padStart(4, "0");

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
    // Use "3G" prefix to match the device's protocol for action commands
    // (same family as RESET, TS, rcapture) so the device actually plays
    // the find-my-device alert sound.
    const command = `[3G*${deviceId}*0004*FIND]`;

    Logging.info(
      `Sending find device (FIND) command to device ${deviceId}: ${command}`
    );

    this.send(client, command);

    return true;
  }

  // ───────────────────────────────────────────────────────────
  // Send SOS number command to device
  // ───────────────────────────────────────────────────────────

  /**
   * Send SOS number settings to a specific device slot.
   *
   * Protocol format:
   *   [3G*YYYYYYYYYY*LEN*SOS1,phoneNumber]
   *
   * Examples:
   *   [3G*8800000015*0010*SOS1,00000000000]   ← set SOS1
   *   [3G*8800000015*0010*SOS2,00000000000]   ← set SOS2
   *   [3G*8800000015*0010*SOS3,00000000000]   ← set SOS3
   *
   * Phone numbers MUST be digits only — no '+', no spaces, no dashes.
   * Always include the country code (e.g. "919999999999" for an Indian
   * mobile). If the country code is missing, prefix it before calling
   * this method.
   *
   * @param deviceId - The device ID (e.g. 8800000015)
   * @param slot     - "SOS1" | "SOS2" | "SOS3"
   * @param phone    - Digits-only phone number (country code included)
   * @returns true if the command was sent, false if device not connected
   */
  public sendSosCommand(
    deviceId: string,
    slot: "SOS1" | "SOS2" | "SOS3",
    phone: string
  ): boolean {
    const client = this.devices.get(deviceId);

    if (!client) {
      Logging.error(
        `Device ${deviceId} is not connected. Cannot send ${slot} command.`
      );

      return false;
    }

    // Strip any non-digit characters defensively so we never write '+' or
    // spaces onto the wire — the device's dialer/SMS module rejects them.
    const digits = (phone || "").replace(/[^0-9]/g, "");

    if (!digits) {
      Logging.error(
        `Refusing to send empty/invalid ${slot} phone number to device ${deviceId}.`
      );

      return false;
    }

    const content = `${slot},${digits}`;
    // LEN is hex (device's parser uses parseInt(..., 16)).
    const length = content.length.toString(16).padStart(4, "0");
    const command = `[3G*${deviceId}*${length}*${content}]`;

    Logging.info(
      `Sending SOS number (${slot}) to device ${deviceId}: ${command}`
    );

    this.send(client, command);

    return true;
  }

  // ───────────────────────────────────────────────────────────
  // Send Phonebook (PHBX) command to device
  // ───────────────────────────────────────────────────────────

  /**
   * Send a single phonebook entry to the device.
   *
   * Protocol format:
   *   [3G*YYYYYYYYYY*LEN*PHBX,<index>,<name>,<number>,<photoData>]
   *
   * Example (no photo):
   *   [3G*7893267563*0017*PHBX,1,Mom,9691905903,]
   *
   * - index:    1-30 (slot on the watch's phonebook)
   * - name:     Unicode (UTF-8)
   * - number:   ASCII digits (+/- allowed on the wire, but we strip
   *             defensively so the dialler doesn't reject it)
   * - photoData: optional, leave empty string for no photo
   *
   * Device reply:
   *   [3G*YYYYYYYYYY*0002*PHBX,<status>]
   *   status: 1 = success, 0 = failure
   *
   * @param deviceId  - The device ID (e.g. 7893267563)
   * @param index     - Phonebook slot 1..30
   * @param name      - Contact name (Unicode OK)
   * @param number    - Phone number (we send digits-only; country code
   *                    is expected to already be included)
   * @param photoData - Optional photo blob (hex/base64). Empty string
   *                    means "no photo".
   * @returns true if the command was written to the socket
   */

  /**
   * UTF-8 byte length of a JS string. We use this for LEN in commands
   * that contain non-ASCII content (e.g. PHBX names like "Màm", "अम्मा").
   * Plain `str.length` would count JS code units, which is wrong for
   * multi-byte UTF-8 sequences and silently truncates the LEN that the
   * device firmware uses to know how many payload bytes to consume.
   */
  private utf8ByteLength(str: string): number {
    return Buffer.byteLength(str, "utf8");
  }

  /**
   * Encode a contact name into the wire format the PHBX firmware expects.
   *
   * The spec says "name: Unicode coding". Different firmware builds on
   * this watch interpret that in two different ways — both of which are
   * common in the wild for Chinese GPS watches:
   *
   *   1. "hex"   — Each Unicode codepoint as 4-digit HEX in BIG-ENDIAN
   *                order. "Mom" -> "4d006f006d00". This is the original
   *                behaviour and works on most firmwares (when the LEN
   *                is computed correctly).
   *
   *   2. "utf8"  — RAW UTF-8 bytes. "Mom" stays as "Mom". Some firmwares
   *                decode the LEN-bounded payload as UTF-8.
   *
   * Pick the right mode with the env var:
   *   PHBX_NAME_ENCODING=hex    (default — same as the original code)
   *   PHBX_NAME_ENCODING=utf8
   *
   * You can see which one your firmware wants by reading what the watch
   * does on the very first entry. With "hex" the device typically
   * shows the name correctly; with "utf8" it may show "U'" or random
   * garbled characters because it's interpreting the wrong format.
   */
  private encodePhonebookName(str: string): string {
    const mode = (process.env.PHBX_NAME_ENCODING || "hex").toLowerCase();
    if (mode === "utf8") {
      return str;
    }
    // hex: each char's Unicode codepoint as 4 hex digits, big-endian.
    let hex = "";
    for (const ch of str) {
      hex += ch.charCodeAt(0).toString(16).padStart(4, "0");
    }
    return hex;
  }

  /**
   * Send a single phonebook entry to the device.
   *
   * Per the protocol spec:
   *   Server send:
   *     [3G*<id>*LEN*PHBX,<index>,<name>,<phone number>,<photo data>]
   *     1. index    1..30         (slot, ASCII)
   *     2. name     Unicode/UTF-8 hex or raw (see PHBX_NAME_ENCODING)
   *     3. phone    ASCII digits  (with country code included)
   *     4. photo    photo data    (optional, often empty)
   *
   *   Device reply:
   *     [3G*<id>*0004*PHBX]            (bare ack = success)
   *     [3G*<id>*0006*PHBX,0]          (explicit failure)
   *     [3G*<id>*0006*PHBX,1]          (explicit success — rare)
   *
   * LEN is the UTF-8 byte length of the content between `*` and `]`,
   * expressed as a 4-digit uppercase hex value.
   */
  public sendPhonebookCommand(
    deviceId: string,
    index: number,
    name: string,
    number: string,
    photoData: string = ""
  ): boolean {
    const client = this.devices.get(deviceId);

    if (!client) {
      Logging.error(
        `Device ${deviceId} is not connected. Cannot send PHBX command.`
      );
      return false;
    }

    if (!Number.isInteger(index) || index < 1 || index > 30) {
      Logging.error(
        `PHBX index ${index} out of range (must be 1-30) for device ${deviceId}`
      );
      return false;
    }

    // Clean the phone number to digits so the watch's dialler accepts it.
    const digits = (number || "").replace(/[^0-9]/g, "");
    if (!digits) {
      Logging.error(
        `Refusing to send PHBX with empty phone number to device ${deviceId}`
      );
      return false;
    }

    // Auto-prepend default country code for 10-digit national numbers.
    const DEFAULT_CC = (process.env.SOS_DEFAULT_COUNTRY_CODE || "").replace(
      /[^0-9]/g,
      ""
    );
    const finalDigits =
      DEFAULT_CC && digits.length === 10 ? DEFAULT_CC + digits : digits;

    // Strip control chars / commas from the name. The cleaned name is
    // then either hex-encoded (default, original behaviour) or kept as
    // raw UTF-8, depending on PHBX_NAME_ENCODING.
    const cleanName = (name || "").replace(/[,\[\]\r\n]/g, " ").trim();
    if (!cleanName) {
      Logging.error(
        `Refusing to send PHBX with empty name to device ${deviceId}`
      );
      return false;
    }
    const encodedName = this.encodePhonebookName(cleanName);
    const photo = photoData || "";

    const content = `PHBX,${index},${encodedName},${finalDigits},${photo}`;
    // LEN = UTF-8 byte length of `content` (which already includes the
    // hex-encoded name, or the raw name — both are ASCII or UTF-8).
    const length = this.utf8ByteLength(content).toString(16).padStart(4, "0");
    const command = `[3G*${deviceId}*${length}*${content}]`;

    Logging.info(
      `Sending phonebook (PHBX) entry #${index} to device ${deviceId} ` +
        `(name_encoding=${(
          process.env.PHBX_NAME_ENCODING || "hex"
        ).toLowerCase()}): ${command}`
    );

    this.send(client, command);
    return true;
  }

  // ───────────────────────────────────────────────────────────
  // Clear a phonebook slot (PHBX with empty name AND empty number)
  // ───────────────────────────────────────────────────────────

  /**
   * Clear a single phonebook slot on the device.
   *
   * IMPORTANT — per the latest protocol spec from the vendor, this
   * firmware does NOT actually understand a separate `DPHBX` command word.
   * The spec only defines PHBX for setting entries, and the way to clear
   * a slot is to re-send the same PHBX packet at that slot index with
   * EMPTY name AND EMPTY number fields. We confirmed via testing that
   * the firmware wipes the name when name is empty BUT keeps the number
   * unless the number field is also empty. So both fields must be empty
   * to fully wipe the contact.
   *
   *   Wire: [3G*<id>*LEN*PHBX,<index>,,,]
   *   Layout: PHBX command word, slot index, EMPTY name, EMPTY number,
   *           EMPTY photo. All three fields after index are blank.
   *
   * The `number` parameter is currently unused for sending on the wire
   * (we always send empty). It is kept in the signature only because
   * earlier the controller was passing the number as a "confirm" — that
   * turned out to be wrong for this firmware, which would keep the
   * previous number. So we accept the parameter and ignore it for now.
   *
   * Device reply (same as for a successful set):
   *   [3G*<id>*0004*PHBX]            (bare ack = OK)
   *   [3G*<id>*0006*PHBX,0]          (failure)
   *   [3G*<id>*0006*PHBX,1]          (explicit success)
   *
   * @param deviceId  - The device ID (e.g. 7893267563)
   * @param index     - Phonebook slot 1..30 to clear
   * @param number    - Optional. Currently unused on the wire because
   *                    this firmware keeps the previous number when a
   *                    number is provided. May be used in the future
   *                    if a firmware variant needs to match by number.
   * @returns true if the command was written to the socket
   */
  public sendDeletePhonebookCommand(
    deviceId: string,
    index: number,
    number: string = ""
  ): boolean {
    const client = this.devices.get(deviceId);

    if (!client) {
      Logging.error(
        `Device ${deviceId} is not connected. Cannot clear PHBX slot.`
      );
      return false;
    }

    if (!Number.isInteger(index) || index < 1 || index > 30) {
      Logging.error(
        `PHBX clear index ${index} out of range (must be 1-30) for device ${deviceId}`
      );
      return false;
    }

    // Clear-slot packet: PHBX,<index>,,, — all three fields after the
    // index (name, number, photo) are EMPTY so the firmware wipes the
    // slot completely. (If we send `PHBX,<index>,,<oldnumber>,` the
    // firmware clears the name but keeps the old number.)
    const content = `PHBX,${index},,,`;
    const length = this.utf8ByteLength(content).toString(16).padStart(4, "0");
    const command = `[3G*${deviceId}*${length}*${content}]`;

    Logging.info(
      `Clearing phonebook (PHBX) slot #${index} on device ${deviceId} ` +
        `(was: ${number || "<empty>"}): ${command}`
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
    // LEN is hex (same as image-packet framing on the receive side).
    const length = content.length.toString(16).padStart(4, "0");
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
    // Note: Using "3G" prefix as shown in the protocol example
    const command = `[3G*${deviceId}*0008*rcapture]`;

    Logging.info(
      `Sending remote snapshot (rcapture) command to device ${deviceId}: ${command}`
    );

    this.send(client, command);

    return true;
  }

  // ───────────────────────────────────────────────────────────
  // Send Auto-Answer (ACALL) command to device
  // ───────────────────────────────────────────────────────────

  /**
   * Toggle the watch's auto-answer feature and (optionally) configure
   * the up-to-3 phone numbers that are allowed to auto-answer.
   *
   * Per the protocol spec:
   *
   *   OFF Auto Answer :  [3G*<id>*0007*ACALL,0]
   *   ON  Auto Answer :  [3G*<id>*LEN*ACALL,<num1>,<num2>,<num3>]
   *
   * Example:
   *   [3G*8800000015*001D*ACALL,134********,0755*******]
   *
   * Device reply (similar to PHBX):
   *   [3G*<id>*0005*ACALL]            (bare ack = success)
   *   [3G*<id>*0007*ACALL,0]          (explicit failure)
   *   [3G*<id>*0007*ACALL,1]          (explicit success)
   *
   * Wire format:
   *   - Use "3G" prefix (matches other action commands — RESET, TS,
   *     rcapture, FIND — which the device actually accepts).
   *   - LEN is the UTF-8 byte length of the content between the third
   *     and fourth asterisks (i.e. everything from "ACALL" through to
   *     the last phone number), padded to 4 hex chars.
   *   - Numbers MUST be ASCII digits (country code included, no '+',
   *     no spaces, no dashes) — same convention as SOS numbers.
   *   - When `enabled` is true and fewer than 3 numbers are supplied,
   *     the remaining slots are sent as empty so the device wipes
   *     any previously-configured numbers in those slots.
   *
   * @param deviceId  The device ID (e.g. 8800000015)
   * @param enabled   true = auto-answer ON, false = auto-answer OFF
   * @param numbers   Up to 3 phone numbers. Ignored when enabled=false.
   *                  Each entry MUST be 5–20 ASCII digits.
   * @returns true if the command was sent, false if the device is
   *          not connected (or the input was rejected).
   */
  public sendAutoAnswerCommand(
    deviceId: string,
    enabled: boolean,
    numbers: string[] = []
  ): boolean {
    const client = this.devices.get(deviceId);

    if (!client) {
      Logging.error(
        `Device ${deviceId} is not connected. Cannot send ACALL command.`
      );
      return false;
    }

    // Build the content body.
    let content: string;
    if (!enabled) {
      // OFF: a single "0" after the command word.
      content = "ACALL,0";
    } else {
      // ON: validate numbers and pad to 3 slots (empty strings for
      // unused slots so the device wipes any stale entries).
      const cleaned = (numbers || [])
        .map((n) => (n || "").toString().trim())
        .filter((n) => n.length > 0);

      if (cleaned.length === 0) {
        Logging.error(
          `Refusing to send ACALL ON with no phone numbers to device ${deviceId}. ` +
            `Provide at least one number, or set enabled=false to disable.`
        );
        return false;
      }

      if (cleaned.length > 3) {
        Logging.error(
          `Refusing to send ACALL ON with ${cleaned.length} numbers to device ${deviceId}; ` +
            `max 3 allowed.`
        );
        return false;
      }

      // Validate each number (ASCII digits, 5–20 chars).
      const phoneRe = /^[0-9]{5,20}$/;
      for (const num of cleaned) {
        if (!phoneRe.test(num)) {
          Logging.error(
            `Refusing to send ACALL ON to device ${deviceId}: invalid phone ` +
              `number '${num}'. Must be 5–20 ASCII digits.`
          );
          return false;
        }
      }

      // Pad to 3 slots. Per spec, the device uses up to 3 whitelist
      // entries — sending blanks for unused slots makes the firmware
      // wipe those slots instead of keeping stale numbers.
      while (cleaned.length < 3) cleaned.push("");
      content = `ACALL,${cleaned.join(",")}`;
    }

    // LEN is the UTF-8 byte length of `content` padded to 4 hex chars.
    const length = this.utf8ByteLength(content).toString(16).padStart(4, "0");

    const command = `[3G*${deviceId}*${length}*${content}]`;

    Logging.info(
      `Sending auto-answer (ACALL) command to device ${deviceId} ` +
        `(enabled=${enabled}, numbers=${JSON.stringify(
          enabled ? numbers : []
        )}): ${command}`
    );

    this.send(client, command);
    return true;
  }

  /**
   * Handle an ACALL reply from the device.
   *
   * Reply shapes:
   *   [3G*<id>*0005*ACALL]            bare ack → success
   *   [3G*<id>*0007*ACALL,1]          explicit success
   *   [3G*<id>*0007*ACALL,0]          failure
   *
   * We treat both empty payload and "1" as success.
   */
  private handleAutoAnswerResponse(
    client: TcpClient,
    packet: ParsedPacket
  ): void {
    const status = (packet.payload || "").trim();
    const ok = status === "" || status === "1";
    Logging.info(
      `ACALL response from device ${packet.deviceId}: status="${
        status || "(ack)"
      }" (${ok ? "OK" : "FAILED"})`
    );
    this.markDeviceOnline(packet.deviceId).catch((error: Error) =>
      Logging.error(
        `Failed to mark device ${packet.deviceId} online from ACALL: ${error.message}`
      )
    );
    void client;
  }

  // ───────────────────────────────────────────────────────────
  // Send SOS-SMS (SOSSMS) command to device
  // ───────────────────────────────────────────────────────────

  /**
   * Toggle the watch's "send SMS to SOS numbers after an SOS alarm"
   * switch.
   *
   * Per the protocol spec:
   *
   *   Server send : [3G*<id>*0008*SOSSMS,0]  (off, do NOT send SMS)
   *                 [3G*<id>*0008*SOSSMS,1]  (on, send SMS to SOS list)
   *
   *   Device reply: [3G*<id>*0006*SOSSMS]    (bare ack = success)
   *
   * When ON, the watch will send an SMS to each configured SOS
   * number immediately after a long-press SOS event. When OFF, no
   * SMS is sent (the watch will still dial if SOS dials are
   * configured).
   *
   * @param deviceId  The device ID (e.g. 8800000015)
   * @param enabled   true = send SMS on SOS alarm, false = do NOT send
   * @returns true if command was sent, false if device not connected
   */
  public sendSosSmsCommand(deviceId: string, enabled: boolean): boolean {
    const client = this.devices.get(deviceId);

    if (!client) {
      Logging.error(
        `Device ${deviceId} is not connected. Cannot send SOSSMS command.`
      );
      return false;
    }

    // Content is exactly "SOSSMS,0" or "SOSSMS,1" — 8 chars.
    const flag = enabled ? "1" : "0";
    const command = `[3G*${deviceId}*0008*SOSSMS,${flag}]`;

    Logging.info(
      `Sending SOS-SMS (SOSSMS) command to device ${deviceId} ` +
        `(enabled=${enabled}): ${command}`
    );

    this.send(client, command);
    return true;
  }

  /**
   * Handle a SOSSMS reply from the device.
   *
   * Reply shapes:
   *   [3G*<id>*0006*SOSSMS]            bare ack → success
   *   [3G*<id>*0008*SOSSMS,0]          failure (some firmwares)
   *   [3G*<id>*0008*SOSSMS,1]          explicit success (some firmwares)
   */
  private handleSosSmsResponse(client: TcpClient, packet: ParsedPacket): void {
    const status = (packet.payload || "").trim();
    const ok = status === "" || status === "1";
    Logging.info(
      `SOSSMS response from device ${packet.deviceId}: status="${
        status || "(ack)"
      }" (${ok ? "OK" : "FAILED"})`
    );
    this.markDeviceOnline(packet.deviceId).catch((error: Error) =>
      Logging.error(
        `Failed to mark device ${packet.deviceId} online from SOSSMS: ${error.message}`
      )
    );
    void client;
  }

  // ───────────────────────────────────────────────────────────
  // Send language / time-zone (LZ) command to device
  // ───────────────────────────────────────────────────────────

  /**
   * Set the watch's language AND/OR time zone via the LZ command.
   *
   * Per the protocol spec:
   *
   *   Server send : [3G*<id>*<LEN>*LZ,<language>,<timezone>]
   *                 (e.g. [3G*8800000015*0006*LZ,1,8])
   *   Device reply: [3G*<id>*0002*LZ]            (bare ack = success)
   *
   * Product requirement: send EITHER language OR timezone in a single
   * request (not both, not neither). Pass `null` for the field that
   * you do NOT want to set; the empty value on the wire tells the
   * firmware to leave that half alone.
   *
   *   language : 0|1|3|4|5|7|8|9|10|11|12|13|14|15|16|17|18|19|
   *              22|23|25|26|27|28|29|34|36   (per the spec)
   *   timezone : integer -12..+14  (e.g. 8 = GMT+8, -5 = EST)
   *
   * @param deviceId  The device ID (e.g. 8800000015)
   * @param language  Language code or null to leave alone
   * @param timezone  Timezone value  or null to leave alone
   * @returns {sent, protocol, content} where `sent` is true if the
   *          command was actually written to the socket.
   */
  public sendLzCommand(
    deviceId: string,
    language: number | null,
    timezone: number | null
  ): { sent: boolean; protocol: string; content: string } {
    const client = this.devices.get(deviceId);

    if (!client) {
      Logging.error(
        `Device ${deviceId} is not connected. Cannot send LZ command.`
      );
      return { sent: false, protocol: "", content: "" };
    }

    // At least one of the two must be present.
    if (language === null && timezone === null) {
      Logging.error(
        `Refusing to send LZ with no language AND no timezone to device ${deviceId}`
      );
      return { sent: false, protocol: "", content: "" };
    }

    // Build the comma-separated payload. Empty side = "leave that
    // half of the setting alone" (e.g. "1," to set only language;
    // ",8" to set only timezone).
    const langPart = language === null ? "" : String(language);
    const tzPart = timezone === null ? "" : String(timezone);
    const content = `LZ,${langPart},${tzPart}`;

    // LEN is the UTF-8 byte length of the content, hex, 4 digits.
    const length = this.utf8ByteLength(content).toString(16).padStart(4, "0");
    const command = `[3G*${deviceId}*${length}*${content}]`;

    Logging.info(
      `Sending language/timezone (LZ) command to device ${deviceId} ` +
        `(language=${language === null ? "<unchanged>" : language}, ` +
        `timezone=${timezone === null ? "<unchanged>" : timezone}): ${command}`
    );

    this.send(client, command);
    return { sent: true, protocol: command, content };
  }

  /**
   * Handle an LZ reply from the device.
   *
   * Reply shapes:
   *   [3G*<id>*0002*LZ]            bare ack → success
   *   [3G*<id>*0004*LZ,0]          failure (some firmwares)
   *   [3G*<id>*0004*LZ,1]          explicit success (some firmwares)
   */
  private handleLzResponse(client: TcpClient, packet: ParsedPacket): void {
    const status = (packet.payload || "").trim();
    const ok = status === "" || status === "1";
    Logging.info(
      `LZ response from device ${packet.deviceId}: status="${
        status || "(ack)"
      }" (${ok ? "OK" : "FAILED"})`
    );
    this.markDeviceOnline(packet.deviceId).catch((error: Error) =>
      Logging.error(
        `Failed to mark device ${packet.deviceId} online from LZ: ${error.message}`
      )
    );
    void client;
  }

  // ───────────────────────────────────────────────────────────
  // Send SILENCETIME / SILENCETIME2 (do-not-disturb / class mode)
  // ───────────────────────────────────────────────────────────

  /**
   * Set the watch's do-not-disturb / class-mode time periods.
   *
   * Two protocols are supported per the spec:
   *
   *   Classic (SILENCETIME) — daily time ranges, up to 4 slots:
   *     [3G*<id>*<LEN>*SILENCETIME,s1,s2,s3,s4]
   *     Each slot = "HH:MM-HH:MM"  (24h, dash between start/end)
   *
   *   Week-version (SILENCETIME2) — same shape plus a 7-bit day mask:
   *     [3G*<id>*<LEN>*SILENCETIME2,s1,s2,s3,s4]
   *     Each slot = "HH:MM-HH:MM-DDDDDDD"
   *                (DDDDDDD = Sun..Sat, 0=off, 1=on)
   *
   *   Device reply (both): [3G*<id>*<LEN>*<command>]  (bare ack)
   *
   * @param deviceId   e.g. "8800000015"
   * @param mode       "SILENCETIME" or "SILENCETIME2"
   * @param slots      array of "HH:MM-HH:MM" strings (1..4 entries).
   *                   Use "" to skip a slot — we still send the comma
   *                   so the firmware wipes that slot.
   * @param weekdays   when mode === "SILENCETIME2":
   *                   - a single 7-char "0/1" string applied to ALL
   *                     slots, OR
   *                   - an array of 7-char strings, one per slot.
   *                   Ignored when mode === "SILENCETIME".
   *
   * @returns { sent, protocol, content }
   */
  public sendSilenceTimeCommand(
    deviceId: string,
    mode: "SILENCETIME" | "SILENCETIME2",
    slots: string[],
    weekdays?: string | string[]
  ): { sent: boolean; protocol: string; content: string } {
    const client = this.devices.get(deviceId);

    if (!client) {
      Logging.error(
        `Device ${deviceId} is not connected. Cannot send ${mode} command.`
      );
      return { sent: false, protocol: "", content: "" };
    }

    if (mode !== "SILENCETIME" && mode !== "SILENCETIME2") {
      Logging.error(
        `Invalid SILENCETIME mode '${mode}' for device ${deviceId}`
      );
      return { sent: false, protocol: "", content: "" };
    }

    if (!Array.isArray(slots) || slots.length < 1 || slots.length > 4) {
      Logging.error(
        `Invalid slots count (${slots?.length}) for ${mode} on device ${deviceId} — must be 1..4`
      );
      return { sent: false, protocol: "", content: "" };
    }

    // Pad to exactly 4 slots so the wire format is always stable.
    // Empty slots are encoded as "" and the firmware will clear them.
    const padded = [...slots];
    while (padded.length < 4) padded.push("");

    // Validate every non-empty slot.
    const slotPattern = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;
    for (let i = 0; i < padded.length; i++) {
      const s = padded[i];
      if (s && !slotPattern.test(s)) {
        Logging.error(
          `Invalid slot #${
            i + 1
          } '${s}' for ${mode} on device ${deviceId} — must be 'HH:MM-HH:MM'`
        );
        return { sent: false, protocol: "", content: "" };
      }
    }

    // Build each slot string. SILENCETIME2 appends the day mask.
    const finalSlots: string[] = [];
    for (let i = 0; i < padded.length; i++) {
      const s = padded[i];
      if (mode === "SILENCETIME") {
        finalSlots.push(s);
        continue;
      }
      // SILENCETIME2 — need a per-slot 7-char mask.
      let mask = "";
      if (Array.isArray(weekdays)) {
        mask = weekdays[i] || "0000000";
      } else if (typeof weekdays === "string") {
        mask = weekdays;
      } else {
        mask = "0000000";
      }
      if (!/^[01]{7}$/.test(mask)) {
        Logging.error(
          `Invalid weekday mask '${mask}' for slot #${
            i + 1
          } of ${mode} on device ${deviceId}`
        );
        return { sent: false, protocol: "", content: "" };
      }
      // Compose: HH:MM-HH:MM-DDDDDDD  (or just HH:MM-HH:MM- if slot empty)
      finalSlots.push(s ? `${s}-${mask}` : `-${mask}`);
    }

    const content = `${mode},${finalSlots.join(",")}`;
    const length = this.utf8ByteLength(content).toString(16).padStart(4, "0");
    const command = `[3G*${deviceId}*${length}*${content}]`;

    Logging.info(
      `Sending do-not-disturb (${mode}) command to device ${deviceId}: ${command}`
    );

    this.send(client, command);
    return { sent: true, protocol: command, content };
  }

  /**
   * Handle a SILENCETIME / SILENCETIME2 reply.
   *
   * Reply shapes:
   *   [3G*<id>*000B*SILENCETIME]      bare ack → success
   *   [3G*<id>*000C*SILENCETIME2]     bare ack → success
   *   [3G*<id>*<L>*SILENCETIME,0]     failure (some firmwares)
   */
  private handleSilenceTimeResponse(
    client: TcpClient,
    packet: ParsedPacket,
    command: "SILENCETIME" | "SILENCETIME2"
  ): void {
    const status = (packet.payload || "").trim();
    const ok = status === "" || status === "1";
    Logging.info(
      `${command} response from device ${packet.deviceId}: status="${
        status || "(ack)"
      }" (${ok ? "OK" : "FAILED"})`
    );
    this.markDeviceOnline(packet.deviceId).catch((error: Error) =>
      Logging.error(
        `Failed to mark device ${packet.deviceId} online from ${command}: ${error.message}`
      )
    );
    void client;
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
