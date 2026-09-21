import { Model, DataTypes, Sequelize, Optional, UUIDV4 } from "sequelize";

// ── Interfaces ──────────────────────────────────────
export interface DeviceVoiceMessageAttributes {
  id: string;
  device_id: string;
  voice_data: Buffer | null;
  voice_file_name: string | null;
  is_send: number;
  is_text: number;
  message: string | null;
  status: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type DeviceVoiceMessageCreationAttributes = Optional<
  DeviceVoiceMessageAttributes,
  "id" | "voice_data" | "voice_file_name" | "is_text" | "message" | "status"
>;

// ── Model Class ──────────────────────────────────────
class DeviceVoiceMessage
  extends Model<
    DeviceVoiceMessageAttributes,
    DeviceVoiceMessageCreationAttributes
  >
  implements DeviceVoiceMessageAttributes
{
  public id!: string;
  public device_id!: string;
  public voice_data!: Buffer | null;
  public voice_file_name!: string | null;
  public is_send!: number;
  public is_text!: number;
  public message!: string | null;
  public status!: string | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  // ── Associations ──
  static associate(models: any) {
    DeviceVoiceMessage.belongsTo(models.Device, {
      foreignKey: "device_id",
      as: "DeviceVoiceMessageDevice",
    });
  }
}

// ── Init & Export ────────────────────────────────────
export default (sequelize: Sequelize, DataTypes: any) => {
  DeviceVoiceMessage.init(
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
      voice_data: {
        type: DataTypes.BLOB,
        allowNull: true,
      },
      voice_file_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      is_send: {
        type: DataTypes.INTEGER(1),
        allowNull: false,
        defaultValue: 1,
      },
      is_text: {
        type: DataTypes.INTEGER(1),
        allowNull: false,
        defaultValue: 0,
        comment: "1 = text-to-speech message, 0 = raw audio voice message",
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Text content used when is_text = 1 (TTS payload)",
      },
      status: {
        type: DataTypes.STRING(1),
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
      modelName: "DeviceVoiceMessage",
      tableName: "DeviceVoiceMessages",
      indexes: [
        {
          name: "devicevoicemessages_device_id_idx",
          fields: ["device_id"],
        },
      ],
    }
  );

  return DeviceVoiceMessage;
};
