"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
// ── Model Class ──────────────────────────────────────────────
class EmergencyContact extends sequelize_1.Model {
    //   public readonly deletedAt!: Date;
    // ── Associations ──
    static associate(models) {
        EmergencyContact.belongsTo(models.Device, {
            foreignKey: "device_id",
            as: "DeviceEmergencyContact",
        });
    }
}
// ── Init & Export ────────────────────────────────────────────
exports.default = (sequelize, DataTypes) => {
    EmergencyContact.init({
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
    }, {
        sequelize,
        modelName: "EmergencyContact",
        paranoid: true, // Enables soft delete using deletedAt
    });
    return EmergencyContact;
};
