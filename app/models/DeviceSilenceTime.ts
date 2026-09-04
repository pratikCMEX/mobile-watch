import { Model, DataTypes, Sequelize, Optional, UUIDV4 } from "sequelize";

/**
 * Server-side mirror of the watch's Do-Not-Disturb / class-mode
 * configuration (SILENCETIME / SILENCETIME2 wire command).
 *
 * One row per (device_id, slot_index) — 1..4 slots per device. Each
 * row carries its own `is_enabled` flag so the UI can toggle / query
 * individual slots and we can answer "how many slots are active on
 * device X" with a simple `COUNT(*) WHERE is_enabled=true`.
 */

// ── Interfaces ──────────────────────────────────────────────
export interface DeviceSilenceTimeAttributes {
  id: string;
  device_id: string;
  /** "SILENCETIME" (daily) or "SILENCETIME2" (per weekday) */
  mode: "SILENCETIME" | "SILENCETIME2";
  /** 1..4 — the on-wire slot position. */
  slot_index: number;
  /** "HH:MM-HH:MM" (24h) or NULL if the slot is empty. */
  time_section: string | null;
  /**
   * 7-char '0'/'1' day mask (Sun..Sat, 0=off, 1=on).
   * NULL when mode === 'SILENCETIME'.
   */
  weekdays_mask: string | null;
  /** Whether this slot is part of the active schedule. */
  is_enabled: boolean;
  /** Last wire-protocol packet sent for this slot. */
  last_command_protocol: string | null;
  /** Last time the device ACKed a SILENCETIME(/2) reply. */
  last_acked_at: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type DeviceSilenceTimeCreationAttributes = Optional<
  DeviceSilenceTimeAttributes,
  | "id"
  | "time_section"
  | "weekdays_mask"
  | "is_enabled"
  | "last_command_protocol"
  | "last_acked_at"
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
  public slot_index!: number;
  public time_section!: string | null;
  public weekdays_mask!: string | null;
  public is_enabled!: boolean;
  public last_command_protocol!: string | null;
  public last_acked_at!: Date | null;
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

      slot_index: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: { min: 1, max: 4 },
      },

      time_section: {
        type: DataTypes.STRING(11),
        allowNull: true,
        defaultValue: null,
      },

      weekdays_mask: {
        type: DataTypes.STRING(7),
        allowNull: true,
        defaultValue: null,
      },

      is_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
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
          name: "devicesilencetimes_device_id_slot_index_unique",
          unique: true,
          fields: ["device_id", "slot_index"],
        },
        {
          name: "devicesilencetimes_device_id_is_enabled_idx",
          fields: ["device_id", "is_enabled"],
        },
      ],
    }
  );

  return DeviceSilenceTime;
};
