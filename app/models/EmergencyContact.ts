import { Model, DataTypes, Sequelize, Optional, UUIDV4 } from "sequelize";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

// ── Interfaces ──────────────────────────────────────────────
export interface EmergencyContactAttributes {
  id: string;
  device_id: string;
  name: string;
  phone_number: string;
  country_code: string;
  //   deletedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

type EmergencyContactCreationAttributes = Optional<
  EmergencyContactAttributes,
  "id"
>;

// ── Model Class ──────────────────────────────────────────────
class EmergencyContact
  extends Model<EmergencyContactAttributes, EmergencyContactCreationAttributes>
  implements EmergencyContactAttributes
{
  public id!: string;
  public device_id!: string;
  public name!: string;
  public phone_number!: string;
  public country_code!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
  //   public readonly deletedAt!: Date;

  // ── Associations ──
  static associate(models: any) {
    EmergencyContact.belongsTo(models.Device, {
      foreignKey: "device_id",
      as: "DeviceEmergencyContact",
    });
  }
}

// ── Init & Export ────────────────────────────────────────────
export default (sequelize: Sequelize, DataTypes: any) => {
  EmergencyContact.init(
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

      //   deletedAt: {
      //     type: DataTypes.DATE,
      //     allowNull: true,
      //     defaultValue: null,
      //   },
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
      modelName: "EmergencyContact",
      paranoid: true, // Enables soft delete using deletedAt
    }
  );

  return EmergencyContact;
};
