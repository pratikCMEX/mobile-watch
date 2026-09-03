import { Model, DataTypes, Sequelize, Optional, UUIDV4 } from "sequelize";

// ── Interfaces ──────────────────────────────────────────────
export interface DeviceAutoAnswerAttributes {
  id: string;
  device_id: string;
  /**
   * ACALL slot on the watch (1..3). Unique per device.
   * Mirrors the three ACALL numbers that can be set on the
   * watch via the [3G*<id>*LEN*ACALL,n1,n2,n3] packet.
   */
  slot_index: number;
  /**
   * Friend / label shown in the mobile app's auto-answer list
   * (e.g. "Dad", "Mom"). Optional.
   */
  name: string | null;
  /**
   * Phone number in digits-only form including the country code
   * (e.g. "919999999999"). Stored as a plain string so any
   * international format is supported.
   */
  phone_number: string;
  /**
   * Country code, split out for analytics / display layers.
   * Optional.
   */
  country_code: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type DeviceAutoAnswerCreationAttributes = Optional<
  DeviceAutoAnswerAttributes,
  "id" | "name" | "country_code"
>;

// ── Model Class ──────────────────────────────────────────────
class DeviceAutoAnswer
  extends Model<DeviceAutoAnswerAttributes, DeviceAutoAnswerCreationAttributes>
  implements DeviceAutoAnswerAttributes
{
  public id!: string;
  public device_id!: string;
  public slot_index!: number;
  public name!: string | null;
  public phone_number!: string;
  public country_code!: string | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  // ── Associations ──
  static associate(models: any) {
    DeviceAutoAnswer.belongsTo(models.Device, {
      foreignKey: "device_id",
      as: "DeviceAutoAnswerDevice",
    });
  }
}

// ── Init & Export ────────────────────────────────────────────
export default (sequelize: Sequelize, DataTypes: any) => {
  DeviceAutoAnswer.init(
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
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      slot_index: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: { min: 1, max: 3 },
      },

      name: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null,
      },

      phone_number: {
        type: DataTypes.STRING(20),
        allowNull: false,
      },

      country_code: {
        type: DataTypes.STRING(10),
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
      modelName: "DeviceAutoAnswer",
      indexes: [
        {
          name: "deviceautoanswers_device_id_slot_index_unique",
          unique: true,
          fields: ["device_id", "slot_index"],
        },
      ],
    }
  );

  return DeviceAutoAnswer;
};
