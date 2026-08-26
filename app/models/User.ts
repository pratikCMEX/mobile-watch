import { Model, DataTypes, Sequelize, Optional, UUIDV4 } from "sequelize";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

// ── Interfaces ──────────────────────────────────────────────
export interface UserAttributes {
  id: string;
  name: string;
  email: string;
  password: string;
  phone_number: string;
  country_code: string;
  session_token: string;
  deletedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

type UserCreationAttributes = Optional<UserAttributes, "id">;

// ── Model Class ──────────────────────────────────────────────
class User
  extends Model<UserAttributes, UserCreationAttributes>
  implements UserAttributes
{
  public id!: string;
  public name!: string;
  public email!: string;
  public password!: string;
  public phone_number!: string;
  public country_code!: string;
  public session_token!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
  public readonly deletedAt!: Date;

  // ── Method Types ──
  // public comparePassword!: (candidatePassword: string) => Promise<boolean>;
  public encodeToken!: () => string;
  public generateOtp!: () => string;

  // ── Associations ──
  static associate(models: any) {
    User.hasMany(models.Device, {
      foreignKey: "owner_id",
      as: "DeviceOwner",
    });
    User.hasMany(models.DeviceMember, {
      foreignKey: "user_id",
      as: "DeviceUser",
    });
    User.hasMany(models.Notification, {
      foreignKey: "user_id",
      as: "UserNotification",
    });
  }
}

// ── Init & Export ────────────────────────────────────────────
export default (sequelize: Sequelize, DataTypes: any) => {
  User.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: UUIDV4,
        allowNull: false,
        primaryKey: true,
      },

      // ── Basic Info (Screen 1 - Register) ──
      name: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: true,
        // unique: true,
        defaultValue: null,
      },
      password: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null,
      },
      phone_number: {
        type: DataTypes.STRING(15),
        allowNull: true,
        // unique: true,
        defaultValue: null,
      },

      country_code: {
        type: DataTypes.STRING(10),
        allowNull: true,
        defaultValue: null, // e.g. +1, +91
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
      modelName: "User",
      paranoid: true, // Enables soft delete using deletedAt
    }
  );

  return User;
};
