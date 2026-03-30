const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/dbConnection");

const BrokerProfile = sequelize.define(
  "BrokerProfile",
  {
    profileId: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
    },
    companyName: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    locality: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    specializations: {
      type: DataTypes.TEXT,
      allowNull: true,
      get() {
        const value = this.getDataValue("specializations");
        if (!value) return [];
        try {
          return JSON.parse(value);
        } catch {
          return [];
        }
      },
      set(value) {
        this.setDataValue("specializations", JSON.stringify(value || []));
      },
    },
    dealsClosed: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    profilePhoto: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "broker_profiles",
  }
);

module.exports = BrokerProfile;
