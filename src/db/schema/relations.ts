import { relations } from "drizzle-orm";
import { companies } from "./companies";
import {
  users,
  auditLogs,
  userAvailability,
  userDriverStatusHistory,
} from "./users";
import {
  fleets,
  vehicleFleets,
  userSecondaryFleets,
  vehicleFleetHistory,
} from "./fleets";
import { vehicles, vehicleStatusHistory } from "./vehicles";
import {
  vehicleSkills,
  userSkills,
  vehicleSkillAssignments,
} from "./skills";
import {
  orders,
  csvColumnMappingTemplates,
  timeWindowPresets,
} from "./orders";
import {
  optimizationConfigurations,
  optimizationJobs,
  optimizationPresets,
  companyOptimizationProfiles,
  planMetrics,
} from "./optimization";
import {
  routeStops,
  routeStopHistory,
  reassignmentsHistory,
  outputHistory,
} from "./routing";
import {
  alertRules,
  alerts,
  alertNotifications,
} from "./alerts";
import { zones, zoneVehicles } from "./zones";
import {
  roles,
  permissions,
  rolePermissions,
  userRoles,
} from "./rbac";
import {
  driverLocations,
  trackingTokens,
  companyTrackingSettings,
} from "./tracking";
import {
  companyWorkflowStates,
  companyWorkflowTransitions,
} from "./workflow";
import { companyFieldDefinitions } from "./custom-fields";

export const companiesRelations = relations(companies, ({ many }) => ({
  users: many(users),
  fleets: many(fleets),
  workflowStates: many(companyWorkflowStates),
  workflowTransitions: many(companyWorkflowTransitions),
  fieldDefinitions: many(companyFieldDefinitions),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  company: one(companies, {
    fields: [users.companyId],
    references: [companies.id],
  }),
  primaryFleet: one(fleets, {
    fields: [users.primaryFleetId],
    references: [fleets.id],
  }),
  acknowledgedAlerts: many(alerts),
  receivedNotifications: many(alertNotifications),
  userSkills: many(userSkills),
  availability: many(userAvailability),
  secondaryFleets: many(userSecondaryFleets),
  statusHistory: many(userDriverStatusHistory),
  assignedVehicles: many(vehicles),
  userRoles: many(userRoles),
}));

export const fleetsRelations = relations(fleets, ({ one, many }) => ({
  company: one(companies, {
    fields: [fleets.companyId],
    references: [companies.id],
  }),
  vehicleFleets: many(vehicleFleets),
  primaryUsers: many(users),
  secondaryUsers: many(userSecondaryFleets),
}));

export const vehiclesRelations = relations(vehicles, ({ one, many }) => ({
  company: one(companies, {
    fields: [vehicles.companyId],
    references: [companies.id],
  }),
  assignedDriver: one(users, {
    fields: [vehicles.assignedDriverId],
    references: [users.id],
  }),
  vehicleFleets: many(vehicleFleets),
  fleetHistory: many(vehicleFleetHistory),
  statusHistory: many(vehicleStatusHistory),
  skillAssignments: many(vehicleSkillAssignments),
}));

export const vehicleFleetsRelations = relations(vehicleFleets, ({ one }) => ({
  company: one(companies, {
    fields: [vehicleFleets.companyId],
    references: [companies.id],
  }),
  vehicle: one(vehicles, {
    fields: [vehicleFleets.vehicleId],
    references: [vehicles.id],
  }),
  fleet: one(fleets, {
    fields: [vehicleFleets.fleetId],
    references: [fleets.id],
  }),
}));

export const vehicleSkillsRelations = relations(
  vehicleSkills,
  ({ one, many }) => ({
    company: one(companies, {
      fields: [vehicleSkills.companyId],
      references: [companies.id],
    }),
    userSkills: many(userSkills),
    vehicleAssignments: many(vehicleSkillAssignments),
  }),
);

export const userSkillsRelations = relations(userSkills, ({ one }) => ({
  company: one(companies, {
    fields: [userSkills.companyId],
    references: [companies.id],
  }),
  user: one(users, {
    fields: [userSkills.userId],
    references: [users.id],
  }),
  skill: one(vehicleSkills, {
    fields: [userSkills.skillId],
    references: [vehicleSkills.id],
  }),
}));

export const vehicleSkillAssignmentsRelations = relations(
  vehicleSkillAssignments,
  ({ one }) => ({
    company: one(companies, {
      fields: [vehicleSkillAssignments.companyId],
      references: [companies.id],
    }),
    vehicle: one(vehicles, {
      fields: [vehicleSkillAssignments.vehicleId],
      references: [vehicles.id],
    }),
    skill: one(vehicleSkills, {
      fields: [vehicleSkillAssignments.skillId],
      references: [vehicleSkills.id],
    }),
  }),
);

export const vehicleFleetHistoryRelations = relations(
  vehicleFleetHistory,
  ({ one }) => ({
    company: one(companies, {
      fields: [vehicleFleetHistory.companyId],
      references: [companies.id],
    }),
    vehicle: one(vehicles, {
      fields: [vehicleFleetHistory.vehicleId],
      references: [vehicles.id],
    }),
    previousFleet: one(fleets, {
      fields: [vehicleFleetHistory.previousFleetId],
      references: [fleets.id],
    }),
    newFleet: one(fleets, {
      fields: [vehicleFleetHistory.newFleetId],
      references: [fleets.id],
    }),
    user: one(users, {
      fields: [vehicleFleetHistory.userId],
      references: [users.id],
    }),
  }),
);

export const vehicleStatusHistoryRelations = relations(
  vehicleStatusHistory,
  ({ one }) => ({
    company: one(companies, {
      fields: [vehicleStatusHistory.companyId],
      references: [companies.id],
    }),
    vehicle: one(vehicles, {
      fields: [vehicleStatusHistory.vehicleId],
      references: [vehicles.id],
    }),
    user: one(users, {
      fields: [vehicleStatusHistory.userId],
      references: [users.id],
    }),
  }),
);

export const userAvailabilityRelations = relations(
  userAvailability,
  ({ one }) => ({
    company: one(companies, {
      fields: [userAvailability.companyId],
      references: [companies.id],
    }),
    user: one(users, {
      fields: [userAvailability.userId],
      references: [users.id],
    }),
  }),
);

export const userSecondaryFleetsRelations = relations(
  userSecondaryFleets,
  ({ one }) => ({
    company: one(companies, {
      fields: [userSecondaryFleets.companyId],
      references: [companies.id],
    }),
    user: one(users, {
      fields: [userSecondaryFleets.userId],
      references: [users.id],
    }),
    fleet: one(fleets, {
      fields: [userSecondaryFleets.fleetId],
      references: [fleets.id],
    }),
  }),
);

export const userDriverStatusHistoryRelations = relations(
  userDriverStatusHistory,
  ({ one }) => ({
    company: one(companies, {
      fields: [userDriverStatusHistory.companyId],
      references: [companies.id],
    }),
    user: one(users, {
      fields: [userDriverStatusHistory.userId],
      references: [users.id],
    }),
    changedByUser: one(users, {
      fields: [userDriverStatusHistory.changedBy],
      references: [users.id],
    }),
  }),
);

export const timeWindowPresetsRelations = relations(
  timeWindowPresets,
  ({ one, many }) => ({
    company: one(companies, {
      fields: [timeWindowPresets.companyId],
      references: [companies.id],
    }),
    orders: many(orders),
  }),
);

export const ordersRelations = relations(orders, ({ one }) => ({
  company: one(companies, {
    fields: [orders.companyId],
    references: [companies.id],
  }),
  timeWindowPreset: one(timeWindowPresets, {
    fields: [orders.timeWindowPresetId],
    references: [timeWindowPresets.id],
  }),
}));

export const csvColumnMappingTemplatesRelations = relations(
  csvColumnMappingTemplates,
  ({ one }) => ({
    company: one(companies, {
      fields: [csvColumnMappingTemplates.companyId],
      references: [companies.id],
    }),
  }),
);

export const optimizationConfigurationsRelations = relations(
  optimizationConfigurations,
  ({ one, many }) => ({
    company: one(companies, {
      fields: [optimizationConfigurations.companyId],
      references: [companies.id],
    }),
    jobs: many(optimizationJobs),
  }),
);

export const optimizationJobsRelations = relations(
  optimizationJobs,
  ({ one, many }) => ({
    company: one(companies, {
      fields: [optimizationJobs.companyId],
      references: [companies.id],
    }),
    configuration: one(optimizationConfigurations, {
      fields: [optimizationJobs.configurationId],
      references: [optimizationConfigurations.id],
    }),
    routeStops: many(routeStops),
    outputHistory: many(outputHistory),
    planMetrics: many(planMetrics),
  }),
);

export const alertRulesRelations = relations(alertRules, ({ one, many }) => ({
  company: one(companies, {
    fields: [alertRules.companyId],
    references: [companies.id],
  }),
  alerts: many(alerts),
}));

export const alertsRelations = relations(alerts, ({ one, many }) => ({
  company: one(companies, {
    fields: [alerts.companyId],
    references: [companies.id],
  }),
  rule: one(alertRules, {
    fields: [alerts.ruleId],
    references: [alertRules.id],
  }),
  acknowledgedByUser: one(users, {
    fields: [alerts.acknowledgedBy],
    references: [users.id],
  }),
  notifications: many(alertNotifications),
}));

export const alertNotificationsRelations = relations(
  alertNotifications,
  ({ one }) => ({
    alert: one(alerts, {
      fields: [alertNotifications.alertId],
      references: [alerts.id],
    }),
    recipient: one(users, {
      fields: [alertNotifications.recipientId],
      references: [users.id],
    }),
  }),
);

export const routeStopsRelations = relations(routeStops, ({ one, many }) => ({
  company: one(companies, {
    fields: [routeStops.companyId],
    references: [companies.id],
  }),
  job: one(optimizationJobs, {
    fields: [routeStops.jobId],
    references: [optimizationJobs.id],
  }),
  user: one(users, {
    fields: [routeStops.userId],
    references: [users.id],
  }),
  vehicle: one(vehicles, {
    fields: [routeStops.vehicleId],
    references: [vehicles.id],
  }),
  order: one(orders, {
    fields: [routeStops.orderId],
    references: [orders.id],
  }),
  zone: one(zones, {
    fields: [routeStops.zoneId],
    references: [zones.id],
  }),
  workflowState: one(companyWorkflowStates, {
    fields: [routeStops.workflowStateId],
    references: [companyWorkflowStates.id],
  }),
  history: many(routeStopHistory),
}));

export const routeStopHistoryRelations = relations(
  routeStopHistory,
  ({ one }) => ({
    company: one(companies, {
      fields: [routeStopHistory.companyId],
      references: [companies.id],
    }),
    routeStop: one(routeStops, {
      fields: [routeStopHistory.routeStopId],
      references: [routeStops.id],
    }),
    user: one(users, {
      fields: [routeStopHistory.userId],
      references: [users.id],
    }),
  }),
);

export const reassignmentsHistoryRelations = relations(
  reassignmentsHistory,
  ({ one }) => ({
    company: one(companies, {
      fields: [reassignmentsHistory.companyId],
      references: [companies.id],
    }),
    job: one(optimizationJobs, {
      fields: [reassignmentsHistory.jobId],
      references: [optimizationJobs.id],
    }),
    absentUser: one(users, {
      fields: [reassignmentsHistory.absentUserId],
      references: [users.id],
    }),
    executedByUser: one(users, {
      fields: [reassignmentsHistory.executedBy],
      references: [users.id],
    }),
  }),
);

export const outputHistoryRelations = relations(outputHistory, ({ one }) => ({
  company: one(companies, {
    fields: [outputHistory.companyId],
    references: [companies.id],
  }),
  job: one(optimizationJobs, {
    fields: [outputHistory.jobId],
    references: [optimizationJobs.id],
  }),
  user: one(users, {
    fields: [outputHistory.generatedBy],
    references: [users.id],
  }),
}));

export const planMetricsRelations = relations(planMetrics, ({ one }) => ({
  company: one(companies, {
    fields: [planMetrics.companyId],
    references: [companies.id],
  }),
  job: one(optimizationJobs, {
    fields: [planMetrics.jobId],
    references: [optimizationJobs.id],
  }),
  configuration: one(optimizationConfigurations, {
    fields: [planMetrics.configurationId],
    references: [optimizationConfigurations.id],
  }),
  comparedToJob: one(optimizationJobs, {
    fields: [planMetrics.comparedToJobId],
    references: [optimizationJobs.id],
  }),
}));

export const zonesRelations = relations(zones, ({ one, many }) => ({
  company: one(companies, {
    fields: [zones.companyId],
    references: [companies.id],
  }),
  vehicleAssignments: many(zoneVehicles),
}));

export const zoneVehiclesRelations = relations(zoneVehicles, ({ one }) => ({
  company: one(companies, {
    fields: [zoneVehicles.companyId],
    references: [companies.id],
  }),
  zone: one(zones, {
    fields: [zoneVehicles.zoneId],
    references: [zones.id],
  }),
  vehicle: one(vehicles, {
    fields: [zoneVehicles.vehicleId],
    references: [vehicles.id],
  }),
}));

export const optimizationPresetsRelations = relations(
  optimizationPresets,
  ({ one }) => ({
    company: one(companies, {
      fields: [optimizationPresets.companyId],
      references: [companies.id],
    }),
  }),
);

export const rolesRelations = relations(roles, ({ one, many }) => ({
  company: one(companies, {
    fields: [roles.companyId],
    references: [companies.id],
  }),
  rolePermissions: many(rolePermissions),
  users: many(userRoles),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}));

export const rolePermissionsRelations = relations(
  rolePermissions,
  ({ one }) => ({
    role: one(roles, {
      fields: [rolePermissions.roleId],
      references: [roles.id],
    }),
    permission: one(permissions, {
      fields: [rolePermissions.permissionId],
      references: [permissions.id],
    }),
  }),
);

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
  }),
  role: one(roles, {
    fields: [userRoles.roleId],
    references: [roles.id],
  }),
}));

export const companyOptimizationProfilesRelations = relations(
  companyOptimizationProfiles,
  ({ one }) => ({
    company: one(companies, {
      fields: [companyOptimizationProfiles.companyId],
      references: [companies.id],
    }),
  }),
);

export const driverLocationsRelations = relations(
  driverLocations,
  ({ one }) => ({
    company: one(companies, {
      fields: [driverLocations.companyId],
      references: [companies.id],
    }),
    driver: one(users, {
      fields: [driverLocations.driverId],
      references: [users.id],
    }),
    vehicle: one(vehicles, {
      fields: [driverLocations.vehicleId],
      references: [vehicles.id],
    }),
    job: one(optimizationJobs, {
      fields: [driverLocations.jobId],
      references: [optimizationJobs.id],
    }),
  }),
);

export const companyFieldDefinitionsRelations = relations(companyFieldDefinitions, ({ one }) => ({
  company: one(companies, {
    fields: [companyFieldDefinitions.companyId],
    references: [companies.id],
  }),
}));

export const companyWorkflowStatesRelations = relations(companyWorkflowStates, ({ one, many }) => ({
  company: one(companies, {
    fields: [companyWorkflowStates.companyId],
    references: [companies.id],
  }),
  transitionsFrom: many(companyWorkflowTransitions, { relationName: "fromState" }),
  transitionsTo: many(companyWorkflowTransitions, { relationName: "toState" }),
  routeStops: many(routeStops),
}));

export const companyWorkflowTransitionsRelations = relations(companyWorkflowTransitions, ({ one }) => ({
  company: one(companies, {
    fields: [companyWorkflowTransitions.companyId],
    references: [companies.id],
  }),
  fromState: one(companyWorkflowStates, {
    fields: [companyWorkflowTransitions.fromStateId],
    references: [companyWorkflowStates.id],
    relationName: "fromState",
  }),
  toState: one(companyWorkflowStates, {
    fields: [companyWorkflowTransitions.toStateId],
    references: [companyWorkflowStates.id],
    relationName: "toState",
  }),
}));

export const trackingTokensRelations = relations(trackingTokens, ({ one }) => ({
  company: one(companies, {
    fields: [trackingTokens.companyId],
    references: [companies.id],
  }),
  order: one(orders, {
    fields: [trackingTokens.orderId],
    references: [orders.id],
  }),
}));

export const companyTrackingSettingsRelations = relations(
  companyTrackingSettings,
  ({ one }) => ({
    company: one(companies, {
      fields: [companyTrackingSettings.companyId],
      references: [companies.id],
    }),
  }),
);
