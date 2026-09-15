import { Model, DataTypes, Sequelize, Optional, UUIDV4 } from "sequelize";

// ── Interfaces ──────────────────────────────────────────────
export interface AppUpdateAttributes {
  id: string;
  apk_version: string;
  type: "ios" | "android";
  force_update: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type AppUpdateCreationAttributes = Optional<AppUpdateAttributes, "id">;

// ── Model Class ──────────────────────────────────────────────
class AppUpdate
  extends Model<AppUpdateAttributes, AppUpdateCreationAttributes>
  implements AppUpdateAttributes
{
  public id!: string;
  public apk_version!: string;
  public type!: "ios" | "android";
  public force_update!: boolean;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

// ── Init & Export ────────────────────────────────────────────
export default (sequelize: Sequelize, DataTypes: any) => {
  AppUpdate.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      apk_version: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      type: {
        type: DataTypes.ENUM("ios", "android"),
        allowNull: false,
      },
      force_update: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: "AppUpdate",
      tableName: "AppUpdates",
    }
  );

  return AppUpdate;
};
