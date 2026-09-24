import type { RequestHandler } from "express";
import type { Database } from "../db/types.js";
import type { Logger } from "../log.js";
import { consoleLogger } from "../log.js";
import { LISTING_PAGE_SIZE, CITY_MAX_LENGTH, SEARCH_LISTINGS_SQL, COUNT_LISTINGS_SQL } from "./constants.js";
import type { ListingQuery, SearchRow } from "./types.js";

export function createListingsHandler(
  db: Database,
  logger: Logger = consoleLogger,
): RequestHandler {
  return (req, res) => {
    const query = readListingQuery(req.query.city, req.query.page);
    if (!query) {
      res.status(400).json({ error: "Paramètres city ou page invalides." });
      return;
    }

    void loadListings(db, query)
      .then((page) => {
        res.json(page);
      })
      .catch((error: unknown) => {
        logger.error("échec de la recherche d'annonces", error);
        if (!res.headersSent) {
          res.status(500).json({ error: "Erreur interne." });
        }
      });
  };
}

function readListingQuery(city: unknown, page: unknown): ListingQuery | null {
  if (typeof city !== "string") return null;

  const normalizedCity = city.trim();
  if (normalizedCity.length === 0 || normalizedCity.length > CITY_MAX_LENGTH) {
    return null;
  }

  const pageText = page === undefined ? "1" : page;
  if (typeof pageText !== "string" || !/^[1-9]\d{0,4}$/.test(pageText)) {
    return null;
  }

  return { city: normalizedCity, page: Number(pageText) };
}

async function loadListings(db: Database, query: ListingQuery) {
  const offset = (query.page - 1) * LISTING_PAGE_SIZE;
  const params = [query.city, LISTING_PAGE_SIZE, offset] as const;

  const [found, counted] = await Promise.all([
    db.query<SearchRow>(SEARCH_LISTINGS_SQL, params),
    db.query<{ total: number }>(COUNT_LISTINGS_SQL, [query.city]),
  ]);

  return {
    items: found.rows.map(toListingItem),
    page: query.page,
    pageSize: LISTING_PAGE_SIZE,
    total: counted.rows[0]?.total ?? 0,
  };
}

function toListingItem(row: SearchRow) {
  return {
    id: row.id,
    title: row.title,
    price: row.price,
    city: row.city,
    createdAt: new Date(row.created_at).toISOString(),
    agency:
      row.agency_id === null || row.agency_name === null
        ? null
        : { id: row.agency_id, name: row.agency_name },
    photos: Array.isArray(row.photo_urls) ? row.photo_urls : [],
  };
}
