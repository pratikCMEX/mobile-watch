"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
// ── Model Class ──────────────────────────────────────────────
class HealthMetric extends sequelize_1.Model {
    //   public readonly deletedAt!: Date;
    // ── Associations ──
    static associate(models) {
        HealthMetric.belongsTo(models.Device, {
            foreignKey: "device_id",
            as: "DeviceHealthMetric",
        });
    }
}
// ── Init & Export ────────────────────────────────────────────
exports.default = (sequelize, DataTypes) => {
    HealthMetric.init({
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
        metric_type: {
            type: DataTypes.ENUM("heart_rate", "blood_pressure", "sleep", "spo2", "calories", "temperature", "distance", "steps_daily", "steps_cumulative"),
            allowNull: false,
        },
        value_primary: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
        value_secondary: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
        unit: { type: DataTypes.STRING, allowNull: true },
        recorded_at: { type: DataTypes.DATE, allowNull: false },
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
        modelName: "HealthMetric",
    });
    return HealthMetric;
};
