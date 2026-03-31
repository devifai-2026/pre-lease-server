const { Role, UserRole, User } = require("../models");

/**
 * Auto-assigns a role to a user if they don't already have it.
 * Idempotent — safe to call multiple times.
 *
 * @param {string} userId
 * @param {string} roleName - e.g. "Investor", "Owner", "Broker"
 * @param {string} reason   - e.g. "first_inquiry", "property_created", "broker_profile_completed", "signup"
 * @param {object} [transaction] - optional Sequelize transaction
 * @returns {{ assigned: boolean, role: object }} assigned=true if the role was newly added
 */
const autoAssignRole = async (userId, roleName, reason, transaction) => {
  const role = await Role.findOne({
    where: { roleName, isActive: true },
    attributes: ["roleId", "roleName"],
  });

  if (!role) {
    throw new Error(`Role "${roleName}" not found`);
  }

  const existing = await UserRole.findOne({
    where: { userId, roleId: role.roleId },
    ...(transaction ? { transaction } : {}),
  });

  if (existing) {
    return { assigned: false, role };
  }

  await UserRole.create(
    {
      userId,
      roleId: role.roleId,
      assignedBy: null,
      assignedReason: reason,
    },
    ...(transaction ? [{ transaction }] : [{}])
  );

  return { assigned: true, role };
};

/**
 * Clears the isGuest flag on the user once they have their first real role.
 */
const clearGuestFlag = async (userId, transaction) => {
  await User.update(
    { isGuest: false },
    {
      where: { userId },
      ...(transaction ? { transaction } : {}),
    }
  );
};

module.exports = { autoAssignRole, clearGuestFlag };
