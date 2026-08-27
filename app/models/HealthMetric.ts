import { Model, DataTypes, Sequelize, Optional, UUIDV4 } from "sequelize";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

// ── Interfaces ──────────────────────────────────────────────
export interface HealthMetricAttributes {
  id: string;
  device_id: string;
  metric_type: string;
  value_primary: number;
  value_secondary: number;
  unit: string;
  recorded_at: Date;
  createdAt: Date;
  updatedAt: Date;
}

type HealthMetricCreationAttributes = Optional<HealthMetricAttributes, "id">;

// ── Model Class ──────────────────────────────────────────────
class HealthMetric
  extends Model<HealthMetricAttributes, HealthMetricCreationAttributes>
  implements HealthMetricAttributes
{
  public id!: string;
  public device_id!: string;
  public metric_type!: string;
  public value_primary!: number;
  public value_secondary!: number;
  public unit!: string;
  public recorded_at!: Date;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
  //   public readonly deletedAt!: Date;

  // ── Associations ──
  static associate(models: any) {
    HealthMetric.belongsTo(models.Device, {
      foreignKey: "device_id",
      as: "DeviceHealthMetric",
    });
  }
}

// ── Init & Export ────────────────────────────────────────────
export default (sequelize: Sequelize, DataTypes: any) => {
  HealthMetric.init(
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
      metric_type: {
        type: DataTypes.ENUM(
          "heart_rate",
          "blood_pressure",
          "sleep",
          "spo2",
          "calories",
          "temperature",
          "distance",
          "steps_daily",
          "steps_cumulative",
          "battery",
          "steps",
          "turnovers"
        ),
        allowNull: false,
      },
      value_primary: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      value_secondary: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      unit: { type: DataTypes.STRING, allowNull: true },
      recorded_at: { type: DataTypes.DATE, allowNull: false },
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
      modelName: "HealthMetric",
    }
  );

  return HealthMetric;
};
