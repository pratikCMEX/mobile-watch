import { Model, DataTypes, Sequelize, Optional, UUIDV4 } from "sequelize";

// ── Interfaces ──────────────────────────────────────────────
export interface DeviceSettingAttributes {
  id: string;
  device_id: string;
  sms_alert_enabled: string;
  take_off_device_alert: string;
  safe_mode: string;
  talking_clock: string;
  night_power_saving: string;
  volume: number;
  brightness: number;
  fall_down_alert_enabled: boolean;
  fall_down_reminder_call: boolean;
  fall_down_level: number;
  scene_mode: number;
  createdAt: Date;
  updatedAt: Date;
}

type DeviceSettingCreationAttributes = Optional<DeviceSettingAttributes, "id">;

// ── Model Class ──────────────────────────────────────────────
class DeviceSetting
  extends Model<DeviceSettingAttributes, DeviceSettingCreationAttributes>
  implements DeviceSettingAttributes
{
  public id!: string;
  public device_id!: string;
  public sms_alert_enabled!: string;
  public take_off_device_alert!: string;
  public safe_mode!: string;
  public talking_clock!: string;
  public night_power_saving!: string;
  public volume!: number;
  public brightness!: number;
  public fall_down_alert_enabled!: boolean;
  public fall_down_reminder_call!: boolean;
  public fall_down_level!: number;
  public scene_mode!: number;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
  //   public readonly deletedAt!: Date;

  // ── Associations ──
  static associate(models: any) {
    DeviceSetting.belongsTo(models.Device, {
      foreignKey: "device_id",
      as: "DeviceSetting",
    });
  }
}

// ── Init & Export ────────────────────────────────────────────
export default (sequelize: Sequelize, DataTypes: any) => {
  DeviceSetting.init(
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

      sms_alert_enabled: {
        type: DataTypes.ENUM("1", "0"),
        allowNull: true,
        defaultValue: "0",
      },
      take_off_device_alert: {
        type: DataTypes.ENUM("1", "0"),
        allowNull: true,
        defaultValue: "0",
      },
      safe_mode: {
        type: DataTypes.ENUM("1", "0"),
        allowNull: true,
        defaultValue: "0",
      },
      talking_clock: {
        type: DataTypes.ENUM("1", "0"),
        allowNull: true,
        defaultValue: "0",
      },
      night_power_saving: {
        type: DataTypes.ENUM("1", "0"),
        allowNull: true,
        defaultValue: "0",
      },
      volume: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 50,
      },
      brightness: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 50,
        validate: {
          min: 0,
          max: 100,
        },
      },
      fall_down_alert_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      fall_down_reminder_call: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      fall_down_level: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 5,
      },
      scene_mode: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        validate: {
          min: 1,
          max: 4,
        },
      },

      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: "DeviceSetting",
      paranoid: true, // Enables soft delete using deletedAt
    }
  );

  return DeviceSetting;
};
