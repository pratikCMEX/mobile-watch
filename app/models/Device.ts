import { Model, DataTypes, Sequelize, Optional, UUIDV4 } from "sequelize";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

// ── Interfaces ──────────────────────────────────────────────
export interface DeviceAttributes {
  id: string;
  owner_id: string;
  imei: string;
  serial_number: string;
  device_name: string;
  email: string;
  phone_number: string;
  country_code: string;
  network_carrier: string;
  network_type: string;
  profile_image: string;
  connection_status: string;
  signal_status: string;
  battery_percentage: number;
  gps_strength: string;
  is_online: boolean;
  last_updated_at: Date;
  location_interval_minutes: number;
  height_cm: number;
  gender: string;
  age: number;
  weight_kg: number;
  createdAt: Date;
  updatedAt: Date;
}

type DeviceCreationAttributes = Optional<DeviceAttributes, "id">;

// ── Model Class ──────────────────────────────────────────────
class Device
  extends Model<DeviceAttributes, DeviceCreationAttributes>
  implements DeviceAttributes
{
  public id!: string;
  public owner_id!: string;
  public imei!: string;
  public serial_number!: string;
  public device_name!: string;
  public network_type!: string;
  public email!: string;
  public phone_number!: string;
  public country_code!: string;
  public network_carrier!: string;
  public profile_image!: string;
  public connection_status!: string;
  public signal_status!: string;
  public battery_percentage!: number;
  public gps_strength!: string;
  public is_online!: boolean;
  public last_updated_at!: Date;
  public location_interval_minutes!: number;
  public height_cm!: number;
  public gender!: string;
  public age!: number;
  public weight_kg!: number;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
  //   public readonly deletedAt!: Date;

  // ── Associations ──
  static associate(models: any) {
    Device.belongsTo(models.User, {
      foreignKey: "owner_id",
      as: "DeviceOwner",
    });
    Device.hasMany(models.DeviceMember, {
      foreignKey: "device_id",
      as: "DeviceMember",
    });
    Device.hasMany(models.Location, {
      foreignKey: "device_id",
      as: "DeviceLocation",
    });
    Device.hasMany(models.Geofence, {
      foreignKey: "device_id",
      as: "DeviceGeofence",
    });
    Device.hasMany(models.EmergencyContact, {
      foreignKey: "device_id",
      as: "DeviceEmergencyContact",
    });
    Device.hasMany(models.HealthMetric, {
      foreignKey: "device_id",
      as: "DeviceHealthMetric",
    });
    Device.hasMany(models.Snapshot, {
      foreignKey: "device_id",
      as: "DeviceSnapshot",
    });
    Device.hasOne(models.DeviceSetting, {
      foreignKey: "device_id",
      as: "DeviceSetting",
    });
    Device.hasMany(models.Notification, {
      foreignKey: "device_id",
      as: "DeviceNotification",
    });
  }
}

// ── Init & Export ────────────────────────────────────────────
export default (sequelize: Sequelize, DataTypes: any) => {
  Device.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: UUIDV4,
        allowNull: false,
        primaryKey: true,
      },

      owner_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "Users", key: "id" },
        onDelete: "CASCADE",
      },
      imei: { type: DataTypes.STRING, allowNull: false, unique: true },
      serial_number: { type: DataTypes.STRING, allowNull: true },
      device_name: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "Device",
      },
      email: { type: DataTypes.STRING, allowNull: false },
      phone_number: { type: DataTypes.STRING, allowNull: true },
      country_code: { type: DataTypes.STRING, allowNull: true },
      network_carrier: { type: DataTypes.STRING, allowNull: true },
      network_type: { type: DataTypes.STRING, allowNull: true },
      profile_image: {
        type: DataTypes.STRING,
        allowNull: true,
        get() {
          const img = this.getDataValue("profile_image");
          if (!img) return null;
          const BASE_URL = process.env.BASE_URL || "http://localhost:3001";
          // const BASE_URL = "http://192.168.1.62:3001";
          return `${BASE_URL}/uploads/profile/${img}`;
        },
      },
      connection_status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "offline",
      },
      signal_status: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null,
      },
      battery_percentage: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null,
      },
      gps_strength: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null,
      },
      is_online: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      last_updated_at: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
      },
      location_interval_minutes: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null,
      },
      height_cm: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null,
      },
      gender: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null,
      },
      age: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null,
      },
      weight_kg: {
        type: DataTypes.INTEGER,
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
      modelName: "Device",
    }
  );

  return Device;
};
