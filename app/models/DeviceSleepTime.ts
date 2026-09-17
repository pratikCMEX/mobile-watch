import { Model, DataTypes, Sequelize, Optional, UUIDV4 } from "sequelize";

export interface DeviceSleepTimeAttributes {
  id: string;
  device_id: string;
  time_section: string | null;
  start_time: string | null;
  end_time: string | null;
  is_enabled: boolean;
  last_command_protocol: string | null;
  last_acked_at: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type DeviceSleepTimeCreationAttributes = Optional<
  DeviceSleepTimeAttributes,
  "id" | "is_enabled" | "last_command_protocol" | "last_acked_at"
>;

class DeviceSleepTime
  extends Model<DeviceSleepTimeAttributes, DeviceSleepTimeCreationAttributes>
  implements DeviceSleepTimeAttributes
{
  public id!: string;
  public device_id!: string;
  public time_section!: string;
  public start_time!: string;
  public end_time!: string;
  public is_enabled!: boolean;
  public last_command_protocol!: string | null;
  public last_acked_at!: Date | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  static associate(models: any) {
    DeviceSleepTime.belongsTo(models.Device, {
      foreignKey: "device_id",
      as: "DeviceSleepTimeDevice",
    });
  }
}

export default (sequelize: Sequelize, DataTypes: any) => {
  DeviceSleepTime.init(
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
      time_section: {
        type: DataTypes.STRING(11),
        allowNull: true,
        defaultValue: null,
        validate: {
          is: /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/,
        },
      },
      start_time: {
        type: DataTypes.STRING(5),
        allowNull: true,
        defaultValue: null,
        validate: {
          is: /^([01]\d|2[0-3]):[0-5]\d$/,
        },
      },
      end_time: {
        type: DataTypes.STRING(5),
        allowNull: true,
        defaultValue: null,
        validate: {
          is: /^([01]\d|2[0-3]):[0-5]\d$/,
        },
      },
      is_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      last_command_protocol: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null,
      },
      last_acked_at: {
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
      modelName: "DeviceSleepTime",
      tableName: "DeviceSleepTimes",
      indexes: [
        {
          name: "devicesleeptimes_device_id_unique",
          unique: true,
          fields: ["device_id"],
        },
        {
          name: "devicesleeptimes_device_id_idx",
          fields: ["device_id"],
        },
      ],
    }
  );

  return DeviceSleepTime;
};
