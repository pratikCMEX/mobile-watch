import { Model, DataTypes, Sequelize, Optional, UUIDV4 } from "sequelize";

// ── Interfaces ──────────────────────────────────────────────
export interface FamilyMemberAttributes {
  id: string;
  device_id: string;
  name: string;
  mobile_no: string;
  createdAt: Date;
  updatedAt: Date;
}

type FamilyMemberCreationAttributes = Optional<FamilyMemberAttributes, "id">;

// ── Model Class ──────────────────────────────────────────────
class FamilyMember
  extends Model<FamilyMemberAttributes, FamilyMemberCreationAttributes>
  implements FamilyMemberAttributes
{
  public id!: string;
  public device_id!: string;
  public name!: string;
  public mobile_no!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  // ── Associations ──
  static associate(models: any) {
    FamilyMember.belongsTo(models.Device, {
      foreignKey: "device_id",
      as: "DeviceFamilyMember",
    });
  }
}

// ── Init & Export ────────────────────────────────────────────
export default (sequelize: Sequelize, DataTypes: any) => {
  FamilyMember.init(
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
        allowNull: false,
      },

      mobile_no: {
        type: DataTypes.STRING(15),
        allowNull: false,
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
      modelName: "FamilyMember",
      paranoid: true, // Enables soft delete using deletedAt
    }
  );

  return FamilyMember;
};
