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
  profile_image?: string | null;
  fcm_token?: string | null;
  device_type?: string | null;
  otp_hash?: string | null;
  otp_expiry?: Date | null;
  otp_attempts?: number;
  reset_token?: string | null;
  reset_token_expiry?: Date | null;
  assigned_staff_id?: string | null;
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
  public profile_image?: string | null;
  public fcm_token?: string | null;
  public device_type?: string | null;

  // ── Password Reset (OTP flow) ──
  public otp_hash?: string | null;
  public otp_expiry?: Date | null;
  public otp_attempts?: number;
  public reset_token?: string | null;
  public reset_token_expiry?: Date | null;
  public assigned_staff_id?: string | null;

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
    User.belongsTo(models.Admin, {
      foreignKey: "assigned_staff_id",
      as: "AssignedStaff",
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
      profile_image: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null,
        get() {
          const img = this.getDataValue("profile_image");
          if (!img) return null;
          const BASE_URL = process.env.BASE_URL || "http://localhost:3001";
          return `${BASE_URL}/uploads/profile/${img}`;
        },
      },
      fcm_token: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null,
        comment: "Firebase Cloud Messaging token for push notifications",
      },
      device_type: {
        type: DataTypes.ENUM("android", "ios"),
        allowNull: true,
        defaultValue: null,
        comment: "Device type: android or ios",
      },

      // ── Password Reset (OTP flow) ──
      otp_hash: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null,
        comment: "bcrypt hash of the 6 digit OTP, never the plain OTP",
      },
      otp_expiry: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
        comment: "Timestamp after which the pending OTP is no longer valid",
      },
      otp_attempts: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "Failed OTP verification attempts for the current OTP",
      },
      reset_token: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null,
        comment:
          "Short lived token issued by /verifyOtp, consumed by /changePassword",
      },
      reset_token_expiry: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
        comment: "Expiry timestamp of reset_token",
      },
      assigned_staff_id: {
        type: DataTypes.UUID,
        allowNull: true,
        defaultValue: null,
        references: { model: "Admins", key: "id" },
        onDelete: "SET NULL",
        comment:
          "Staff (Admin with role='staff') this user is assigned to. Nullable — admin-created or self-signed-up users have none. At most one staff per user.",
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
