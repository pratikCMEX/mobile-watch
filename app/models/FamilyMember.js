"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
// ── Model Class ──────────────────────────────────────────────
class FamilyMember extends sequelize_1.Model {
    // ── Associations ──
    static associate(models) {
        FamilyMember.belongsTo(models.Device, {
            foreignKey: "device_id",
            as: "DeviceFamilyMember",
        });
    }
}
// ── Init & Export ────────────────────────────────────────────
exports.default = (sequelize, DataTypes) => {
    FamilyMember.init({
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
            allowNull: false,
        },
        mobile_no: {
            type: DataTypes.STRING(15),
            allowNull: false,
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
        modelName: "FamilyMember",
        paranoid: true, // Enables soft delete using deletedAt
    });
    return FamilyMember;
};
