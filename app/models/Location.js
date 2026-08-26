"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
// ── Model Class ──────────────────────────────────────────────
class Location extends sequelize_1.Model {
    // ── Associations ──
    static associate(models) {
        Location.belongsTo(models.Device, {
            foreignKey: "device_id",
            as: "DeviceLocation",
        });
    }
}
// ── Init & Export ────────────────────────────────────────────
exports.default = (sequelize, DataTypes) => {
    Location.init({
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
        latitude: {
            type: DataTypes.DECIMAL(10, 7),
            allowNull: false,
        },
        longitude: {
            type: DataTypes.DECIMAL(10, 7),
            allowNull: false,
        },
        speed_kmh: {
            type: DataTypes.DECIMAL(6, 2),
            allowNull: true,
        },
        direction: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        address: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        total_distance_km: {
            type: DataTypes.DECIMAL(8, 2),
            allowNull: true,
        },
        is_valid_fix: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
        recorded_at: {
            type: DataTypes.DATE,
            allowNull: false,
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
        modelName: "Location",
    });
    return Location;
};
