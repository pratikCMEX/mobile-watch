import { Model, DataTypes, Sequelize, Optional, UUIDV4 } from "sequelize";

// ── Interfaces ──────────────────────────────────────────────
export interface ReminderAttributes {
  id: string;
  device_id: string;
  type: string;
  reminder_settings: string;
  number: number;
  reminder_text: string | null;
  voice_data: Buffer | null;
  is_active: boolean;
  last_command_protocol: string | null;
  last_acked_at: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

type ReminderCreationAttributes = Optional<ReminderAttributes, "id">;

// ── Model Class ──────────────────────────────────────────────
class Reminder
  extends Model<ReminderAttributes, ReminderCreationAttributes>
  implements ReminderAttributes
{
  public id!: string;
  public device_id!: string;
  public type!: string;
  public reminder_settings!: string;
  public number!: number;
  public reminder_text!: string | null;
  public voice_data!: Buffer | null;
  public is_active!: boolean;
  public last_command_protocol!: string | null;
  public last_acked_at!: Date | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  // ── Associations ──
  static associate(models: any) {
    Reminder.belongsTo(models.Device, {
      foreignKey: "device_id",
      as: "Device",
    });
  }
}

// ── Init & Export ────────────────────────────────────────────
export default (sequelize: Sequelize, DataTypes: any) => {
  Reminder.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: UUIDV4,
      },
      device_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      type: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "general",
        comment: "pill | water | general | sedentary",
      },
      reminder_settings: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: "time-switch-frequency-custom, e.g. 11:25-1-2",
      },
      number: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: "1-3, which reminder slot (up to 3 reminders max)",
      },
      reminder_text: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Unicode hex-encoded reminder text, e.g. 006f00770070006d0067",
      },
      voice_data: {
        type: DataTypes.BLOB,
        allowNull: true,
        comment: "Optional AMR audio data (binary)",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      last_command_protocol: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: "Last TAKEPILLS command sent to device",
      },
      last_acked_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      tableName: "Reminders",
      timestamps: true,
      underscored: false,
    }
  );

  return Reminder;
};
