import { Model, Sequelize, Optional, UUIDV4 } from "sequelize";

// ── Interfaces ──────────────────────────────────────────────
// Watches assigned to a staff account. Ignored when the staff member
// has Admin.all_watches = true.
export interface StaffDeviceAttributes {
  id: string;
  staff_id: string;
  device_id: string;
  createdAt: Date;
  updatedAt: Date;
}

type StaffDeviceCreationAttributes = Optional<
  StaffDeviceAttributes,
  "id" | "createdAt" | "updatedAt"
>;

// ── Model Class ──────────────────────────────────────────────
class StaffDevice
  extends Model<StaffDeviceAttributes, StaffDeviceCreationAttributes>
  implements StaffDeviceAttributes
{
  public id!: string;
  public staff_id!: string;
  public device_id!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  // ── Associations ──
  static associate(models: any) {
    StaffDevice.belongsTo(models.Admin, {
      foreignKey: "staff_id",
      as: "Staff",
    });
    StaffDevice.belongsTo(models.Device, {
      foreignKey: "device_id",
      as: "Device",
    });
  }
}

// ── Init & Export ────────────────────────────────────────────
export default (sequelize: Sequelize, DataTypes: any) => {
  StaffDevice.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      staff_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "Admins", key: "id" },
        onDelete: "CASCADE",
      },
      device_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "Devices", key: "id" },
        onDelete: "CASCADE",
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
      modelName: "StaffDevice",
    }
  );

  return StaffDevice;
};
