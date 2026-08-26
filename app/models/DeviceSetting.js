"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
// ── Model Class ──────────────────────────────────────────────
class DeviceSetting extends sequelize_1.Model {
    //   public readonly deletedAt!: Date;
    // ── Associations ──
    static associate(models) {
        DeviceSetting.belongsTo(models.Device, {
            foreignKey: "device_id",
            as: "DeviceSetting",
        });
    }
}
// ── Init & Export ────────────────────────────────────────────
exports.default = (sequelize, DataTypes) => {
    DeviceSetting.init({
        id: {
            type: DataTypes.UUID,
            defaultValue: sequelize_1.UUIDV4,
            allowNull: false,
            primaryKey: true,
        },
        device_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: "Devices", key: "id" },
            onDelete: "CASCADE",
        },
        sms_alert_enabled: {
            type: DataTypes.ENUM("1", "0"),
            allowNull: true,
            defaultValue: "0",
        },
        take_off_device_alert: {
            type: DataTypes.ENUM("1", "0"),
            allowNull: true,
            defaultValue: "0",
        },
        safe_mode: {
            type: DataTypes.ENUM("1", "0"),
            allowNull: true,
            defaultValue: "0",
        },
        talking_clock: {
            type: DataTypes.ENUM("1", "0"),
            allowNull: true,
            defaultValue: "0",
        },
        night_power_saving: {
            type: DataTypes.ENUM("1", "0"),
            allowNull: true,
            defaultValue: "0",
        },
        volume: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 50,
        },
        brightness: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 50,
            validate: {
                min: 0,
                max: 100,
            },
        },
        fall_down_alert_enabled: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
        fall_down_reminder_call: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
        fall_down_level: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 5,
        },
        createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: sequelize_1.Sequelize.literal("CURRENT_TIMESTAMP"),
        },
        updatedAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },
    }, {
        sequelize,
        modelName: "DeviceSetting",
        paranoid: true, // Enables soft delete using deletedAt
    });
    return DeviceSetting;
};
