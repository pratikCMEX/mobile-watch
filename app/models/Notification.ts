import { Model, DataTypes, Sequelize, Optional, UUIDV4 } from "sequelize";

// ── Interfaces ──────────────────────────────────────────────
export interface NotificationAttributes {
  id: string;
  device_id: string;
  user_id: string | null;
  type: string;
  title: string;
  body: string | null;
  metadata: any | null;
  is_read: string;
  createdAt: Date;
  updatedAt: Date;
}

type NotificationCreationAttributes = Optional<NotificationAttributes, "id">;

// ── Model Class ──────────────────────────────────────────────
class Notification
  extends Model<NotificationAttributes, NotificationCreationAttributes>
  implements NotificationAttributes
{
  public id!: string;
  public device_id!: string;
  public user_id!: string | null;
  public type!: string;
  public title!: string;
  public body!: string | null;
  public metadata!: any | null;
  public is_read!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  // ── Associations ──
  static associate(models: any) {
    Notification.belongsTo(models.Device, {
      foreignKey: "device_id",
      as: "DeviceNotification",
    });

    Notification.belongsTo(models.User, {
      foreignKey: "user_id",
      as: "UserNotification",
    });
  }
}

// ── Init & Export ────────────────────────────────────────────
export default (sequelize: Sequelize, DataTypes: any) => {
  Notification.init(
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
      user_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "Users", key: "id" },
        onDelete: "SET NULL",
      },
      type: {
        type: DataTypes.ENUM(
          "sos",
          "geo_fence_out",
          "geo_fence_in",
          "low_battery",
          "sim_remove",
          "network",
          "fall_detection",
          "device_offline",
          "general"
        ),
        allowNull: false,
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      body: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      is_read: {
        type: DataTypes.ENUM("1", "0"),
        allowNull: false,
        defaultValue: "0",
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
      modelName: "Notification",
      tableName: "Notifications",
    }
  );

  return Notification;
};
