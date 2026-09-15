import { Model, DataTypes, Sequelize, Optional, UUIDV4 } from "sequelize";
import bcrypt from "bcrypt";

export interface AdminAttributes {
  id: string;
  username: string;
  password: string;
  email?: string | null;
  status: "active" | "inactive";
  session_token: string;
  createdAt: Date;
  updatedAt: Date;
}

type AdminCreationAttributes = Optional<AdminAttributes, "id">;

class Admin
  extends Model<AdminAttributes, AdminCreationAttributes>
  implements AdminAttributes
{
  public id!: string;
  public username!: string;
  public password!: string;
  public email?: string | null;
  public status!: "active" | "inactive";
  public session_token!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  public comparePassword!: (candidatePassword: string) => Promise<boolean>;

  static associate(models: any) {
    // Define associations if needed
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
