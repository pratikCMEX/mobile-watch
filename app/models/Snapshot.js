"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
// ── Model Class ──────────────────────────────────────────────
class Snapshot extends sequelize_1.Model {
    // ── Associations ──
    static associate(models) {
        Snapshot.belongsTo(models.Device, {
            foreignKey: "device_id",
            as: "DeviceSnapshot",
        });
    }
}
// ── Init & Export ────────────────────────────────────────────
exports.default = (sequelize, DataTypes) => {
    Snapshot.init({
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
        image_url: {
            type: DataTypes.STRING,
            allowNull: false,
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
        modelName: "Snapshot",
        paranoid: true, // Enables soft delete using deletedAt
    });
    return Snapshot;
};
