"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
// ── Model Class ──────────────────────────────────────────────
class Geofence extends sequelize_1.Model {
    //   public readonly deletedAt!: Date;
    // ── Associations ──
    static associate(models) {
        Geofence.belongsTo(models.Device, {
            foreignKey: "device_id",
            as: "DeviceGeofence",
        });
    }
}
// ── Init & Export ────────────────────────────────────────────
exports.default = (sequelize, DataTypes) => {
    Geofence.init({
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
        latitude: {
            type: DataTypes.DECIMAL(10, 7),
            allowNull: false,
        },
        longitude: {
            type: DataTypes.DECIMAL(10, 7),
            allowNull: false,
        },
        radius: {
            type: DataTypes.DECIMAL(6, 2),
            allowNull: false,
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
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
        modelName: "Geofence",
        paranoid: true, // Enables soft delete using deletedAt
    });
    return Geofence;
};
