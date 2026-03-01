"use strict";
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      -- Users
      CREATE INDEX idx_users_user_type ON users(user_type);
      CREATE INDEX idx_users_mobile_number ON users(mobile_number);
      CREATE INDEX idx_users_email ON users(email);
      CREATE INDEX idx_users_is_active ON users(is_active);
      CREATE INDEX idx_users_last_login_at ON users(last_login_at);
      CREATE INDEX idx_users_otp_expires_at ON users(otp_expires_at) WHERE otp IS NOT NULL;

      -- Roles & Permissions
      CREATE INDEX idx_roles_role_name ON roles(role_name);
      CREATE INDEX idx_roles_role_type ON roles(role_type);
      CREATE INDEX idx_roles_is_active ON roles(is_active);
      CREATE INDEX idx_permissions_code ON permissions(code);
      CREATE INDEX idx_permissions_category ON permissions(category);
      CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
      CREATE INDEX idx_user_roles_role_id ON user_roles(role_id);
      CREATE INDEX idx_role_permissions_role_id ON role_permissions(role_id);
      CREATE INDEX idx_role_permissions_permission_id ON role_permissions(permission_id);

      -- Tokens
      CREATE INDEX idx_tokens_user_id ON tokens(user_id);
      CREATE INDEX idx_tokens_refresh_token ON tokens(refresh_token);
      CREATE INDEX idx_tokens_expires_at ON tokens(expires_at);
      CREATE INDEX idx_tokens_user_active ON tokens(user_id, is_active);
      CREATE INDEX idx_tokens_last_used_at ON tokens(last_used_at);

      -- Caretakers & Amenities
      CREATE INDEX idx_caretakers_name ON caretakers(caretaker_name);
      CREATE INDEX idx_caretakers_is_active ON caretakers(is_active);
      CREATE INDEX idx_amenities_name ON amenities(amenity_name);
      CREATE INDEX idx_amenities_category ON amenities(category);
      CREATE INDEX idx_amenities_is_active ON amenities(is_active);

      -- Properties
      CREATE INDEX idx_properties_owner_id ON properties(owner_id);
      CREATE INDEX idx_properties_broker_id ON properties(broker_id);
      CREATE INDEX idx_properties_sales_id ON properties(sales_id);
      CREATE INDEX idx_properties_property_type ON properties(property_type);
      CREATE INDEX idx_properties_city ON properties(city);
      CREATE INDEX idx_properties_state ON properties(state);
      CREATE INDEX idx_properties_maintained_by ON properties(maintained_by_id);
      CREATE INDEX idx_properties_is_active ON properties(is_active);
      CREATE INDEX idx_properties_owner_active ON properties(owner_id, is_active);
      CREATE INDEX idx_properties_broker_active ON properties(broker_id, is_active);
      CREATE INDEX idx_properties_sales_active ON properties(sales_id, is_active);
      CREATE INDEX idx_properties_city_state ON properties(city, state);
      CREATE INDEX idx_properties_lease_dates ON properties(lease_start_date, lease_end_date);
      CREATE INDEX idx_properties_carpet_area ON properties(carpet_area, carpet_area_unit);
      CREATE INDEX idx_properties_verification_status ON properties(is_verified);
      CREATE INDEX idx_properties_selling_status ON properties(selling_status);
      CREATE INDEX idx_properties_sales_status ON properties(sales_id, selling_status) WHERE is_active = true;

      -- Sales Relationship
      CREATE UNIQUE INDEX unique_active_assignment ON sales_relationship(sales_executive_id) WHERE is_active = true;
      CREATE INDEX idx_sales_exec_active ON sales_relationship(sales_executive_id, is_active);
      CREATE INDEX idx_sales_manager_active ON sales_relationship(sales_manager_id, is_active);
      CREATE INDEX idx_assigned_at ON sales_relationship(assigned_at DESC);
      CREATE UNIQUE INDEX idx_manager_exec_active ON sales_relationship(sales_manager_id, sales_executive_id) WHERE is_active = true;

      -- Property Manager Notes
      CREATE INDEX idx_property_manager_notes_sales_exec ON property_manager_notes(sales_executive_id) WHERE is_active = true;
      CREATE INDEX idx_property_manager_notes_jsonb ON property_manager_notes USING gin(notes);
      CREATE INDEX idx_property_manager_notes_updated ON property_manager_notes(updated_at DESC) WHERE is_active = true;

      -- Property Amenities, Certifications, Connectivity, Media
      CREATE INDEX idx_property_amenities_property_id ON property_amenities(property_id);
      CREATE INDEX idx_property_amenities_amenity_id ON property_amenities(amenity_id);
      CREATE INDEX idx_property_certifications_property_id ON property_certifications(property_id);
      CREATE INDEX idx_property_certifications_type ON property_certifications(certification_type);
      CREATE INDEX idx_property_connectivity_property_id ON property_connectivity(property_id);
      CREATE INDEX idx_property_connectivity_type ON property_connectivity(connectivity_type);
      CREATE INDEX idx_property_media_property_id ON property_media(property_id);
      CREATE INDEX idx_property_media_type ON property_media(media_type);

      -- Notification Events
      CREATE INDEX idx_property_notification_event_property_id ON property_notification_event(property_id);
      CREATE INDEX idx_property_notification_event_user_id ON property_notification_event(user_id);
      CREATE INDEX idx_property_notification_event_created_at ON property_notification_event(created_at DESC);
      CREATE INDEX idx_property_notification_event_composite ON property_notification_event(property_id, user_id, created_at DESC);

      -- Audit & API Logs
      CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
      CREATE INDEX idx_audit_logs_record_id ON audit_logs(record_id);
      CREATE INDEX idx_audit_logs_entity_type ON audit_logs(entity_type);
      CREATE INDEX idx_audit_logs_operation ON audit_logs(operation);
      CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
      CREATE INDEX idx_audit_logs_entity_record ON audit_logs(entity_type, record_id);
      CREATE INDEX idx_api_logs_user_id ON api_logs(user_id);
      CREATE INDEX idx_api_logs_endpoint ON api_logs(endpoint);
      CREATE INDEX idx_api_logs_http_method ON api_logs(http_method);
      CREATE INDEX idx_api_logs_response_status ON api_logs(response_status);
      CREATE INDEX idx_api_logs_request_timestamp ON api_logs(request_timestamp DESC);
      CREATE INDEX idx_api_logs_response_time ON api_logs(response_time_ms);

      -- Property Verification Logs
      CREATE INDEX IF NOT EXISTS idx_pvl_property_id ON property_verification_logs(property_id);
      CREATE INDEX IF NOT EXISTS idx_pvl_user_id ON property_verification_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_pvl_status ON property_verification_logs(status);
      CREATE INDEX IF NOT EXISTS idx_pvl_created_at ON property_verification_logs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_pvl_property_status ON property_verification_logs(property_id, status);

      -- Property Inquiries
      CREATE INDEX IF NOT EXISTS idx_property_inquiries_assigned_to ON property_inquiries(assigned_to) WHERE assigned_to IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_property_inquiries_created_at ON property_inquiries(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_property_inquiries_inquirer_id ON property_inquiries(inquirer_id);
      CREATE INDEX IF NOT EXISTS idx_property_inquiries_priority ON property_inquiries(priority);
      CREATE INDEX IF NOT EXISTS idx_property_inquiries_property_id ON property_inquiries(property_id);
      CREATE INDEX IF NOT EXISTS idx_property_inquiries_source ON property_inquiries(source);
    `);
  },
  async down(queryInterface) {
    // Drop indexes in reverse — add DROP INDEX statements here if ever needed
    await queryInterface.sequelize.query(`SELECT 1`); // no-op
  },
};
