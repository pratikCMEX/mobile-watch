import { Model, DataTypes, Sequelize, Optional, UUIDV4 } from "sequelize";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

// ── Interfaces ──────────────────────────────────────────────
export interface GeofenceAttributes {
  id: string;
  device_id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  is_active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type GeofenceCreationAttributes = Optional<GeofenceAttributes, "id">;

// ── Model Class ──────────────────────────────────────────────
class Geofence
  extends Model<GeofenceAttributes, GeofenceCreationAttributes>
  implements GeofenceAttributes
{
  public id!: string;
  public device_id!: string;
  public name!: string;
  public latitude!: number;
  public longitude!: number;
  public radius!: number;
  public is_active!: boolean;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
  //   public readonly deletedAt!: Date;

  // ── Associations ──
  static associate(models: any) {
    Geofence.belongsTo(models.Device, {
      foreignKey: "device_id",
      as: "DeviceGeofence",
    });
  }
}

// ── Init & Export ────────────────────────────────────────────
export default (sequelize: Sequelize, DataTypes: any) => {
  Geofence.init(
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
      name: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null,
      },

      latitude: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: false,
      },
      longitude: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: false,
      },
      radius: {
        type: DataTypes.DECIMAL(6, 2),
        allowNull: false,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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
      modelName: "Geofence",
      paranoid: true, // Enables soft delete using deletedAt
    }
  );

  return Geofence;
};
