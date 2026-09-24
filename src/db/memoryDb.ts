import { statementId } from "./statement.js";
import type { BookingStatus, DatabaseState } from "./state.js";
import type { Database, QueryResult } from "./types.js";

type SearchRow = {
  id: string;
  title: string;
  price: number;
  city: string;
  created_at: string;
  agency_id: string | null;
  agency_name: string | null;
  photo_urls: string[];
};

export type MemoryDatabase = Database & {
  // Copie de l'état, réservée aux tests.
  snapshot: () => DatabaseState;
};

export function createMemoryDatabase(initial: DatabaseState): MemoryDatabase {
  const state = structuredClone(initial);
  const database = createExecutor(state, true);

  return Object.assign(database, {
    snapshot: () => structuredClone(state),
  });
}

function createExecutor(state: DatabaseState, isRoot: boolean): Database {
  const database: Database = {
    async query<T>(sql: string, params: readonly unknown[] = []) {
      return dispatch(state, sql, params) as QueryResult<T>;
    },

    async transaction<T>(run: (tx: Database) => Promise<T>): Promise<T> {
      if (!isRoot) {
        return run(database);
      }

      const draft = structuredClone(state);
      const result = await run(createExecutor(draft, false));
      state.agencies = draft.agencies;
      state.listings = draft.listings;
      state.photos = draft.photos;
      state.bookings = draft.bookings;
      state.events = draft.events;
      return result;
    },
  };

  return database;
}

function dispatch(
  state: DatabaseState,
  sql: string,
  params: readonly unknown[],
): QueryResult<unknown> {
  switch (statementId(sql)) {
    case "listing.search":
      return searchListings(state, params);
    case "listing.count":
      return countListings(state, params);
    case "webhook.claim":
      return claimWebhookEvent(state, params);
    case "booking.markpaid":
      return markBookingPaid(state, params);
    case "webhook.email":
      return setEventFlag(state, params, "emailSent");
    case "webhook.crm":
      return setEventFlag(state, params, "crmNotified");
    default:
      throw new Error("Requête non simulée.");
  }
}

function searchListings(
  state: DatabaseState,
  params: readonly unknown[],
): QueryResult<SearchRow> {
  const city = readString(params, 0);
  const limit = readNumber(params, 1);
  const offset = readNumber(params, 2);

  const matched = state.listings
    .filter((listing) => listing.city === city)
    .sort((left, right) => {
      const byDate = right.createdAt.getTime() - left.createdAt.getTime();
      if (byDate !== 0) {
        return byDate;
      }
      return compareTextDesc(left.id, right.id);
    });

  const rows = matched.slice(offset, offset + limit).map((listing) => {
    const agency = state.agencies.find((item) => item.id === listing.agencyId);
    const photoUrls = state.photos
      .filter((photo) => photo.listingId === listing.id)
      .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
      .map((photo) => photo.url);

    return {
      id: listing.id,
      title: listing.title,
      price: listing.price,
      city: listing.city,
      created_at: listing.createdAt.toISOString(),
      agency_id: agency?.id ?? null,
      agency_name: agency?.name ?? null,
      photo_urls: photoUrls,
    };
  });

  return { rows, rowCount: rows.length };
}

function countListings(
  state: DatabaseState,
  params: readonly unknown[],
): QueryResult<{ total: number }> {
  const city = readString(params, 0);
  const total = state.listings.filter((listing) => listing.city === city).length;
  return { rows: [{ total }], rowCount: 1 };
}

function claimWebhookEvent(
  state: DatabaseState,
  params: readonly unknown[],
): QueryResult<{ id: string }> {
  const id = readString(params, 0);
  const receivedAt = readString(params, 1);

  if (state.events.some((event) => event.id === id)) {
    return { rows: [], rowCount: 0 };
  }

  state.events.push({ id, receivedAt, emailSent: false, crmNotified: false });
  return { rows: [{ id }], rowCount: 1 };
}

function markBookingPaid(
  state: DatabaseState,
  params: readonly unknown[],
): QueryResult<never> {
  const status = readString(params, 0);
  const id = readString(params, 1);

  if (!isBookingStatus(status)) {
    throw new Error("Statut de réservation inconnu.");
  }

  const booking = state.bookings.find((item) => item.id === id);
  if (!booking) {
    return { rows: [], rowCount: 0 };
  }

  booking.status = status;
  return { rows: [], rowCount: 1 };
}

function setEventFlag(
  state: DatabaseState,
  params: readonly unknown[],
  key: "emailSent" | "crmNotified",
): QueryResult<{ id: string }> {
  const id = readString(params, 0);
  const next = readBoolean(params, 1);
  const expected = readBoolean(params, 2);
  const event = state.events.find((item) => item.id === id && item[key] === expected);
  if (!event) {
    return { rows: [], rowCount: 0 };
  }

  event[key] = next;
  return { rows: [{ id }], rowCount: 1 };
}

function readString(params: readonly unknown[], index: number): string {
  const value = params[index];
  if (typeof value !== "string") {
    throw new Error(`Le paramètre $${index + 1} doit être une chaîne.`);
  }
  return value;
}

function readBoolean(params: readonly unknown[], index: number): boolean {
  const value = params[index];
  if (typeof value !== "boolean") {
    throw new Error(`Le paramètre $${index + 1} doit être un booléen.`);
  }
  return value;
}

function readNumber(params: readonly unknown[], index: number): number {
  const value = params[index];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Le paramètre $${index + 1} doit être un nombre.`);
  }
  return value;
}

function compareTextDesc(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? 1 : -1;
}

function isBookingStatus(value: string): value is BookingStatus {
  return value === "pending" || value === "paid";
}

