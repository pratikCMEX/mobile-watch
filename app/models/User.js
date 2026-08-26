"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
// ── Model Class ──────────────────────────────────────────────
class User extends sequelize_1.Model {
    // ── Associations ──
    static associate(models) {
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
    }
}
// ── Init & Export ────────────────────────────────────────────
exports.default = (sequelize, DataTypes) => {
    User.init({
        id: {
            type: DataTypes.UUID,
            defaultValue: sequelize_1.UUIDV4,
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
    }, {
        sequelize,
        modelName: "User",
        paranoid: true, // Enables soft delete using deletedAt
    });
    return User;
};
