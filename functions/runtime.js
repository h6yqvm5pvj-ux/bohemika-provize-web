"use strict";
const accounts = {
  aiAssistant: "bf-ai-assist", sendTeamMessage: "bf-team", sendTestPush: "bf-test-push",
  cuzkSuggestAddress: "bf-cuzk-suggest", cuzkLookupByAddress: "bf-cuzk-address",
  cuzkLookupByAdresniMisto: "bf-cuzk-place", rsvVehicleLookup: "bf-vehicle",
  fakturoidWebhook: "bf-billing", notifyAdminOnUserRequest: "bf-notify-admin",
  notifyManagerOnNewEntry: "bf-notify-manager", notifyAutoAnniversary: "bf-notify-anniversary",
  notifyUnpaidContracts: "bf-notify-unpaid",
};
function runtimeOptions(name) {
  if (!accounts[name]) throw new Error("Unknown function identity");
  return { serviceAccount: `${accounts[name]}@${process.env.GCLOUD_PROJECT || "bohemikasmlouvy"}.iam.gserviceaccount.com`, maxInstances: 20 };
}
module.exports = { accounts, runtimeOptions };
