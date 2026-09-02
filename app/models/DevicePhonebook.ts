import { Model, DataTypes, Sequelize, Optional, UUIDV4 } from "sequelize";

// ── Interfaces ──────────────────────────────────────────────
export interface DevicePhonebookAttributes {
  id: string;
  device_id: string;
  /**
   * Watch's phonebook slot, 1..30. Unique per device.
   */
  slot_index: number;
  name: string | null;
  phone_number: string | null;
  country_code: string | null;
  /**
   * Optional avatar/photo blob (hex or base64). Empty string means
   * "no photo".
   */
  photo: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type DevicePhonebookCreationAttributes = Optional<
  DevicePhonebookAttributes,
  "id" | "name" | "phone_number" | "country_code" | "photo"
>;

// ── Model Class ──────────────────────────────────────────────
class DevicePhonebook
  extends Model<DevicePhonebookAttributes, DevicePhonebookCreationAttributes>
  implements DevicePhonebookAttributes
{
  public id!: string;
  public device_id!: string;
  public slot_index!: number;
  public name!: string | null;
  public phone_number!: string | null;
  public country_code!: string | null;
  public photo!: string | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  // ── Associations ──
  static associate(models: any) {
    DevicePhonebook.belongsTo(models.Device, {
      foreignKey: "device_id",
      as: "DevicePhonebookDevice",
    });
  }
}

// ── Init & Export ────────────────────────────────────────────
export default (sequelize: Sequelize, DataTypes: any) => {
  DevicePhonebook.init(
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

      slot_index: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: { min: 1, max: 30 },
      },

      name: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null,
      },

      phone_number: {
        type: DataTypes.STRING(15),
        allowNull: true,
        defaultValue: null,
      },

      country_code: {
        type: DataTypes.STRING(10),
        allowNull: true,
        defaultValue: null,
      },

      photo: {
        type: DataTypes.TEXT,
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
      modelName: "DevicePhonebook",
      indexes: [
        {
          name: "devicephonebooks_device_id_slot_index_unique",
          unique: true,
          fields: ["device_id", "slot_index"],
        },
      ],
    }
  );

  return DevicePhonebook;
};
