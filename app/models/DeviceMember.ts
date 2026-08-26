import { Model, DataTypes, Sequelize, Optional, UUIDV4 } from "sequelize";

// ── Interfaces ──────────────────────────────────────────────
export interface DeviceMemberAttributes {
  id: string;
  device_id: string;
  user_id: string;
  role: "admin" | "member";
  createdAt: Date;
  updatedAt: Date;
}

type DeviceMemberCreationAttributes = Optional<DeviceMemberAttributes, "id">;

// ── Model Class ──────────────────────────────────────────────
class DeviceMember
  extends Model<DeviceMemberAttributes, DeviceMemberCreationAttributes>
  implements DeviceMemberAttributes
{
  public id!: string;
  public device_id!: string;
  public user_id!: string;
  public role!: "admin" | "member";

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  // ── Associations ──
  static associate(models: any) {
    DeviceMember.belongsTo(models.User, {
      foreignKey: "user_id",
      as: "DeviceUser",
    });
    DeviceMember.belongsTo(models.Device, {
      foreignKey: "device_id",
      as: "DeviceMember",
    });
  }
}

// ── Init & Export ────────────────────────────────────────────
export default (sequelize: Sequelize, DataTypes: any) => {
  DeviceMember.init(
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
        allowNull: false,
        references: { model: "Users", key: "id" },
        onDelete: "CASCADE",
      },
      role: {
        type: DataTypes.ENUM("admin", "member"),
        allowNull: false,
        defaultValue: "member",
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
      modelName: "DeviceMember",
    }
  );

  return DeviceMember;
};
