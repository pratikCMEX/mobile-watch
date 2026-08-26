"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
// ── Model Class ──────────────────────────────────────────────
class DeviceMember extends sequelize_1.Model {
    // ── Associations ──
    static associate(models) {
        DeviceMember.belongsTo(models.User, {
            foreignKey: "user_id",
            as: "DeviceUser",
        });
        DeviceMember.belongsTo(models.Device, {
            foreignKey: "device_id",
            as: "DeviceMember",
        });
    }
}
// ── Init & Export ────────────────────────────────────────────
exports.default = (sequelize, DataTypes) => {
    DeviceMember.init({
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
            allowNull: false,
            references: { model: "Users", key: "id" },
            onDelete: "CASCADE",
        },
        role: {
            type: DataTypes.ENUM("admin", "member"),
            allowNull: false,
            defaultValue: "member",
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
        modelName: "DeviceMember",
    });
    return DeviceMember;
};
