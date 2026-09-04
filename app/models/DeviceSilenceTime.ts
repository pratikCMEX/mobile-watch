import { Model, DataTypes, Sequelize, Optional, UUIDV4 } from "sequelize";

/**
 * Server-side mirror of the watch's Do-Not-Disturb / class-mode
 * configuration (SILENCETIME / SILENCETIME2 wire command).
 *
 * One row per device.  The 4 wire slots are stored as 4 individual
 * columns so they can be indexed, queried and surfaced as a stable
 * array shape.  When the device replies with a bare ACK we update
 * `last_acked_at` and bump `enabled`.
 */

// ── Interfaces ──────────────────────────────────────────────
export interface DeviceSilenceTimeAttributes {
  id: string;
  device_id: string;
  /** "SILENCETIME" (daily) or "SILENCETIME2" (per weekday) */
  mode: "SILENCETIME" | "SILENCETIME2";
  /** Slot 1..4 — "HH:MM-HH:MM" or "HH:MM-HH:MM-DDDDDDD" or "" to skip. */
  slot_1: string | null;
  slot_2: string | null;
  slot_3: string | null;
  slot_4: string | null;
  /**
   * 7-char '0'/'1' day masks (Sun..Sat), one per slot.
   * NULL for classic SILENCETIME mode.
   */
  weekdays: string[] | null;
  /** Last wire-protocol packet sent to the device. */
  last_command_protocol: string | null;
  /** Last time the device ACKed the SILENCETIME(/2) reply. */
  last_acked_at: Date | null;
  /** Whether at least one slot is filled (DND is "active"). */
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type DeviceSilenceTimeCreationAttributes = Optional<
  DeviceSilenceTimeAttributes,
  | "id"
  | "slot_1"
  | "slot_2"
  | "slot_3"
  | "slot_4"
  | "weekdays"
  | "last_command_protocol"
  | "last_acked_at"
  | "enabled"
>;

// ── Model Class ──────────────────────────────────────────────
class DeviceSilenceTime
  extends Model<
    DeviceSilenceTimeAttributes,
    DeviceSilenceTimeCreationAttributes
  >
  implements DeviceSilenceTimeAttributes
{
  public id!: string;
  public device_id!: string;
  public mode!: "SILENCETIME" | "SILENCETIME2";
  public slot_1!: string | null;
  public slot_2!: string | null;
  public slot_3!: string | null;
  public slot_4!: string | null;
  public weekdays!: string[] | null;
  public last_command_protocol!: string | null;
  public last_acked_at!: Date | null;
  public enabled!: boolean;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  // ── Associations ──
  static associate(models: any) {
    DeviceSilenceTime.belongsTo(models.Device, {
      foreignKey: "device_id",
      as: "DeviceSilenceTimeDevice",
    });
  }
}

// ── Init & Export ────────────────────────────────────────────
export default (sequelize: Sequelize, DataTypes: any) => {
  DeviceSilenceTime.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: UUIDV4,
        allowNull: false,
        primaryKey: true,
      },

      device_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "Devices", key: "id" },
        onDelete: "CASCADE",
      },

      mode: {
        type: DataTypes.ENUM("SILENCETIME", "SILENCETIME2"),
        allowNull: false,
        defaultValue: "SILENCETIME",
      },

      slot_1: {
        type: DataTypes.STRING(32),
        allowNull: true,
        defaultValue: null,
      },
      slot_2: {
        type: DataTypes.STRING(32),
        allowNull: true,
        defaultValue: null,
      },
      slot_3: {
        type: DataTypes.STRING(32),
        allowNull: true,
        defaultValue: null,
      },
      slot_4: {
        type: DataTypes.STRING(32),
        allowNull: true,
        defaultValue: null,
      },

      weekdays: {
        type: DataTypes.ARRAY(DataTypes.STRING(7)),
        allowNull: true,
        defaultValue: null,
      },

      last_command_protocol: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null,
      },

      last_acked_at: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
      },

      enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: "DeviceSilenceTime",
      indexes: [
        {
          name: "devicesilencetimes_device_id_unique",
          unique: true,
          fields: ["device_id"],
        },
      ],
    }
  );

  return DeviceSilenceTime;
};
