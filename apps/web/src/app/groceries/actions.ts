"use server";

import { getViewer } from "@/lib/household";
import { chefContext } from "@/lib/chef/server";
import { isIsoDate, weekdayIndex } from "@/lib/chef/dates";
import { defaultAisle } from "@/lib/grocery/aisles";

export type GroceryActionResult = { ok: true; key?: string } | { ok: false; error: string };

async function storeFor(weekStart: string) {
  if (!isIsoDate(weekStart) || weekdayIndex(weekStart) !== 0) return null;
  const viewer = await getViewer();
  if (viewer.kind !== "signed-in" || !viewer.household) return null;
  const { store } = await chefContext({ userId: viewer.userId, firstName: viewer.firstName, household: viewer.household });
  return store;
}

const failed = (e: unknown): GroceryActionResult => {
  console.error("grocery list", e);
  return { ok: false, error: "That didn't save." };
};

export async function checkGroceryItem(weekStart: string, key: string, checked: boolean): Promise<GroceryActionResult> {
  const store = await storeFor(weekStart);
  if (!store || typeof key !== "string" || !key || key.length > 120) return { ok: false, error: "Sign in first." };
  try {
    await store.checkGroceryItem(weekStart, key, checked === true);
    return { ok: true };
  } catch (e) {
    return failed(e);
  }
}

export async function addGroceryItem(weekStart: string, label: string): Promise<GroceryActionResult> {
  const store = await storeFor(weekStart);
  const clean = typeof label === "string" ? label.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  if (!store) return { ok: false, error: "Sign in first." };
  if (!clean) return { ok: false, error: "Type what to add." };
  try {
    return { ok: true, key: await store.addGroceryItem(weekStart, clean.toLowerCase(), defaultAisle(clean)) };
  } catch (e) {
    return failed(e);
  }
}

export async function removeGroceryItem(weekStart: string, key: string): Promise<GroceryActionResult> {
  const store = await storeFor(weekStart);
  if (!store || typeof key !== "string" || !key.startsWith("extra:")) return { ok: false, error: "Sign in first." };
  try {
    await store.removeGroceryItem(weekStart, key);
    return { ok: true };
  } catch (e) {
    return failed(e);
  }
}

export async function setGroceryStatus(weekStart: string, key: string, status: "have" | "need" | null): Promise<GroceryActionResult> {
  const store = await storeFor(weekStart);
  if (!store || typeof key !== "string" || !key || key.length > 120) return { ok: false, error: "Sign in first." };
  if (status !== null && status !== "have" && status !== "need") return { ok: false, error: "That didn't save." };
  try {
    await store.setGroceryStatus(weekStart, key, status);
    return { ok: true };
  } catch (e) {
    return failed(e);
  }
}
