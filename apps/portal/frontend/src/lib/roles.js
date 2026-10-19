export const ROLES = Object.freeze({
  ADMINISTRATOR: 'ADMINISTRATOR',
  SUPERVISOR: 'SUPERVISOR',
  USER: 'USER',
});

export const ROLE_LABELS = Object.freeze({
  [ROLES.ADMINISTRATOR]: 'Administrator',
  [ROLES.SUPERVISOR]: 'Supervisor',
  [ROLES.USER]: 'User',
});

const OPERATIONAL_MANAGER_ROLES = new Set([
  ROLES.SUPERVISOR,
  ROLES.ADMINISTRATOR,
]);

export function canRunSolver(role) {
  return OPERATIONAL_MANAGER_ROLES.has(role);
}

export function canManageBoxInventory(role) {
  return OPERATIONAL_MANAGER_ROLES.has(role);
}

export function canManageUsers(role) {
  return OPERATIONAL_MANAGER_ROLES.has(role);
}
