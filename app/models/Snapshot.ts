import { Model, DataTypes, Sequelize, Optional, UUIDV4 } from "sequelize";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

// ── Interfaces ──────────────────────────────────────────────
export interface SnapshotAttributes {
  id: string;
  device_id: string;
  image_url: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date;
}

type SnapshotCreationAttributes = Optional<SnapshotAttributes, "id">;

// ── Model Class ──────────────────────────────────────────────
class Snapshot
  extends Model<SnapshotAttributes, SnapshotCreationAttributes>
  implements SnapshotAttributes
{
  public id!: string;
  public device_id!: string;
  public image_url!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
  public readonly deletedAt!: Date;

  // ── Associations ──
  static associate(models: any) {
    Snapshot.belongsTo(models.Device, {
      foreignKey: "device_id",
      as: "DeviceSnapshot",
    });
  }
}

// ── Init & Export ────────────────────────────────────────────
export default (sequelize: Sequelize, DataTypes: any) => {
  Snapshot.init(
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
      image_url: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      deletedAt: {
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
      modelName: "Snapshot",
      paranoid: true, // Enables soft delete using deletedAt
    }
  );

  return Snapshot;
};
