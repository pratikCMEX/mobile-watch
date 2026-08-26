import { Model, DataTypes, Sequelize, Optional, UUIDV4 } from "sequelize";

// ── Interfaces ──────────────────────────────────────────────
export interface LocationAttributes {
  id: string;
  device_id: string;
  latitude: number;
  longitude: number;
  speed_kmh: number | null;
  direction: string | null;
  address: string | null;
  total_distance_km: number | null;
  is_valid_fix: boolean;
  recorded_at: Date;
  createdAt: Date;
  updatedAt: Date;
}

type LocationCreationAttributes = Optional<LocationAttributes, "id">;

// ── Model Class ──────────────────────────────────────────────
class Location
  extends Model<LocationAttributes, LocationCreationAttributes>
  implements LocationAttributes
{
  public id!: string;
  public device_id!: string;
  public latitude!: number;
  public longitude!: number;
  public speed_kmh!: number | null;
  public direction!: string | null;
  public address!: string | null;
  public total_distance_km!: number | null;
  public is_valid_fix!: boolean;
  public recorded_at!: Date;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  // ── Associations ──
  static associate(models: any) {
    Location.belongsTo(models.Device, {
      foreignKey: "device_id",
      as: "DeviceLocation",
    });
  }
}

// ── Init & Export ────────────────────────────────────────────
export default (sequelize: Sequelize, DataTypes: any) => {
  Location.init(
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
      latitude: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: false,
      },
      longitude: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: false,
      },
      speed_kmh: {
        type: DataTypes.DECIMAL(6, 2),
        allowNull: true,
      },
      direction: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      address: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      total_distance_km: {
        type: DataTypes.DECIMAL(8, 2),
        allowNull: true,
      },
      is_valid_fix: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      recorded_at: {
        type: DataTypes.DATE,
        allowNull: false,
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
      modelName: "Location",
    }
  );

  return Location;
};
