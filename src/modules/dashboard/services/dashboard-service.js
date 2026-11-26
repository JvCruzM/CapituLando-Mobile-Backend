import { readDashboard } from "../repositories/dashboard.js";

export async function getDashboard(db, ownerId) {
  return readDashboard(db, ownerId);
}
