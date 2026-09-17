import { Model, DataTypes, Sequelize, Optional, UUIDV4 } from "sequelize";

const DEVICE_ALARM_VALUE_PATTERN =
  /^((?:[01]?\d|2[0-3]):[0-5]\d)-([01])-([1-3])(?:-([01]{7}))?$/;

export interface DeviceAlarmAttributes {
  id: string;
  device_id: string;
  slot_index: number;
  alarm_time: string;
  is_enabled: boolean;
  alarm_type: 1 | 2 | 3;
  weekdays_mask: string | null;
  alarm_value: string;
  last_command_protocol: string | null;
  last_acked_at: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type DeviceAlarmCreationAttributes = Optional<
  DeviceAlarmAttributes,
  | "id"
  | "is_enabled"
  | "weekdays_mask"
  | "last_command_protocol"
  | "last_acked_at"
>;

class DeviceAlarm
  extends Model<DeviceAlarmAttributes, DeviceAlarmCreationAttributes>
  implements DeviceAlarmAttributes
{
  public id!: string;
  public device_id!: string;
  public slot_index!: number;
  public alarm_time!: string;
  public is_enabled!: boolean;
  public alarm_type!: 1 | 2 | 3;
  public weekdays_mask!: string | null;
  public alarm_value!: string;
  public last_command_protocol!: string | null;
  public last_acked_at!: Date | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  static associate(models: any) {
    DeviceAlarm.belongsTo(models.Device, {
      foreignKey: "device_id",
      as: "DeviceAlarmDevice",
    });
  }
}

export default (sequelize: Sequelize, DataTypes: any) => {
  DeviceAlarm.init(
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
        type: DataTypes.SMALLINT,
        allowNull: false,
        validate: { min: 1, max: 3 },
      },
      alarm_time: {
        type: DataTypes.STRING(5),
        allowNull: false,
        validate: {
          is: /^([01]\d|2[0-3]):[0-5]\d$/,
        },
      },
      is_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      alarm_type: {
        type: DataTypes.SMALLINT,
        allowNull: false,
        validate: { min: 1, max: 3 },
      },
      weekdays_mask: {
        type: DataTypes.STRING(7),
        allowNull: true,
        defaultValue: null,
        validate: {
          is: /^[01]{7}$/,
        },
      },
      alarm_value: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: {
          is: DEVICE_ALARM_VALUE_PATTERN,
        },
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
      modelName: "DeviceAlarm",
      tableName: "DeviceAlarms",
      indexes: [
        {
          name: "devicealarms_device_id_slot_index_unique",
          unique: true,
          fields: ["device_id", "slot_index"],
        },
        {
          name: "devicealarms_device_id_idx",
          fields: ["device_id"],
        },
      ],
    }
  );

  return DeviceAlarm;
};
