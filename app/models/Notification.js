"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
// ── Model Class ──────────────────────────────────────────────
class Notification extends sequelize_1.Model {
    // ── Associations ──
    static associate(models) {
        Notification.belongsTo(models.Device, {
            foreignKey: "device_id",
            as: "DeviceNotification",
        });
        Notification.belongsTo(models.User, {
            foreignKey: "user_id",
            as: "UserNotification",
        });
    }
}
// ── Init & Export ────────────────────────────────────────────
exports.default = (sequelize, DataTypes) => {
    Notification.init({
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
        user_id: {
            type: DataTypes.UUID,
            allowNull: true,
            references: { model: "Users", key: "id" },
            onDelete: "SET NULL",
        },
        type: {
            type: DataTypes.ENUM("sos", "geo_fence_out", "geo_fence_in", "low_battery", "sim_remove", "network", "fall_detection", "device_offline", "general"),
            allowNull: false,
        },
        title: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        body: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        metadata: {
            type: DataTypes.JSONB,
            allowNull: true,
        },
        is_read: {
            type: DataTypes.ENUM("1", "0"),
            allowNull: false,
            defaultValue: "0",
        },
        createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        updatedAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },
    }, {
        sequelize,
        modelName: "Notification",
        tableName: "Notifications",
    });
    return Notification;
};
