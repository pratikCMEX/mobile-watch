import { Model, Sequelize, Optional, UUIDV4 } from "sequelize";

// ── Interfaces ──────────────────────────────────────────────
export interface AdminLoginLogAttributes {
  id: string;
  admin_id: string;
  ip_address?: string | null;
  user_agent?: string | null;
  login_at: Date;
  createdAt: Date;
  updatedAt: Date;
}

type AdminLoginLogCreationAttributes = Optional<
  AdminLoginLogAttributes,
  "id" | "login_at" | "createdAt" | "updatedAt"
>;

// ── Model Class ──────────────────────────────────────────────
class AdminLoginLog
  extends Model<AdminLoginLogAttributes, AdminLoginLogCreationAttributes>
  implements AdminLoginLogAttributes
{
  public id!: string;
  public admin_id!: string;
  public ip_address?: string | null;
  public user_agent?: string | null;
  public login_at!: Date;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  // ── Associations ──
  static associate(models: any) {
    AdminLoginLog.belongsTo(models.Admin, {
      foreignKey: "admin_id",
      as: "Admin",
    });
  }
}

// ── Init & Export ────────────────────────────────────────────
export default (sequelize: Sequelize, DataTypes: any) => {
  AdminLoginLog.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      admin_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "Admins", key: "id" },
        onDelete: "CASCADE",
      },
      ip_address: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null,
      },
      user_agent: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null,
      },
      login_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
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
      modelName: "AdminLoginLog",
    }
  );

  return AdminLoginLog;
};
