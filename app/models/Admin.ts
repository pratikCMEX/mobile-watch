import { Model, DataTypes, Sequelize, Optional, UUIDV4 } from "sequelize";
import bcrypt from "bcrypt";

export interface AdminAttributes {
  id: string;
  name?: string | null;
  username: string;
  password: string;
  email?: string | null;
  role: "admin" | "staff";
  all_watches: boolean;
  status: "active" | "inactive";
  session_token: string;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type AdminCreationAttributes = Optional<
  AdminAttributes,
  "id" | "role" | "all_watches" | "status" | "session_token" | "createdAt" | "updatedAt"
>;

class Admin
  extends Model<AdminAttributes, AdminCreationAttributes>
  implements AdminAttributes
{
  public id!: string;
  public name?: string | null;
  public username!: string;
  public password!: string;
  public email?: string | null;
  public role!: "admin" | "staff";
  public all_watches!: boolean;
  public status!: "active" | "inactive";
  public session_token!: string;
  public readonly deletedAt?: Date | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  public comparePassword!: (candidatePassword: string) => Promise<boolean>;

  static associate(models: any) {
    Admin.hasMany(models.StaffDevice, {
      foreignKey: "staff_id",
      as: "StaffDevices",
    });
    Admin.belongsToMany(models.Device, {
      through: models.StaffDevice,
      foreignKey: "staff_id",
      otherKey: "device_id",
      as: "AssignedDevices",
    });
    Admin.hasMany(models.AdminLoginLog, {
      foreignKey: "admin_id",
      as: "LoginLogs",
    });
  }
}

export default (sequelize: Sequelize, DataTypes: any) => {
  Admin.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null,
      },
      username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      password: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null,
      },
      role: {
        type: DataTypes.ENUM("admin", "staff"),
        allowNull: false,
        defaultValue: "admin",
      },
      all_watches: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      status: {
        type: DataTypes.ENUM("active", "inactive"),
        allowNull: false,
        defaultValue: "active",
      },
      session_token: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "",
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
      modelName: "Admin",
      paranoid: true, // Soft delete (used for staff) via deletedAt
      hooks: {
        beforeCreate: async (admin: any) => {
          if (admin.password) {
            admin.password = await bcrypt.hash(admin.password, 10);
          }
        },
        beforeUpdate: async (admin: any) => {
          if (admin.changed('password')) {
            admin.password = await bcrypt.hash(admin.password, 10);
          }
        },
      },
    }
  );

  Admin.prototype.comparePassword = async function (candidatePassword: string) {
    return bcrypt.compare(candidatePassword, this.password);
  };

  return Admin;
};
