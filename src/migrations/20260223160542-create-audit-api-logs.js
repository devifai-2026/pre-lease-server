"use strict";
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("audit_logs", {
      audit_log_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      user_id: {
        type: Sequelize.UUID,
        references: { model: "users", key: "user_id" },
        onDelete: "SET NULL",
      },
      record_id: { type: Sequelize.TEXT, allowNull: false },
      operation: { type: Sequelize.STRING(20), allowNull: false },
      entity_type: { type: Sequelize.STRING(50), allowNull: false },
      old_value: { type: Sequelize.JSONB },
      new_value: { type: Sequelize.JSONB },
      table_name: { type: Sequelize.STRING(50) },
      ip_address: { type: "INET" },
      user_agent: { type: Sequelize.TEXT },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn("NOW") },
    });
    await queryInterface.sequelize.query(`
      ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_operation_check 
        CHECK (operation IN ('INSERT','UPDATE','DELETE'));
    `);

    await queryInterface.createTable("api_logs", {
      log_id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
      },
      user_id: {
        type: Sequelize.UUID,
        references: { model: "users", key: "user_id" },
        onDelete: "SET NULL",
      },
      http_method: { type: Sequelize.STRING(10), allowNull: false },
      endpoint: { type: Sequelize.STRING(500), allowNull: false },
      request_headers: { type: Sequelize.JSONB },
      request_body: { type: Sequelize.JSONB },
      query_params: { type: Sequelize.JSONB },
      response_status: { type: Sequelize.INTEGER },
      response_headers: { type: Sequelize.JSONB },
      response_body: { type: Sequelize.JSONB },
      ip_address: { type: Sequelize.STRING(50) },
      user_agent: { type: Sequelize.TEXT },
      request_timestamp: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
      response_timestamp: { type: Sequelize.DATE },
      response_time_ms: { type: Sequelize.INTEGER },
      error_message: { type: Sequelize.TEXT },
      stack_trace: { type: Sequelize.TEXT },
      session_id: { type: Sequelize.STRING(255) },
      environment: { type: Sequelize.STRING(20) },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable("api_logs");
    await queryInterface.dropTable("audit_logs");
  },
};
