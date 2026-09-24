const LISTING_PAGE_SIZE = 20;

const CITY_MAX_LENGTH = 80;

const SEARCH_LISTINGS_SQL = `
-- tana:listing.search
SELECT
  l.id,
  l.title,
  l.price,
  l.city,
  l.created_at,
  a.id AS agency_id,
  a.name AS agency_name,
  COALESCE(
    json_agg(p.url ORDER BY p.id) FILTER (WHERE p.id IS NOT NULL),
    '[]'::json
  ) AS photo_urls
FROM listings l
LEFT JOIN agencies a ON a.id = l.agency_id
LEFT JOIN photos p ON p.listing_id = l.id
WHERE l.city = $1
GROUP BY l.id, l.title, l.price, l.city, l.created_at, a.id, a.name
ORDER BY l.created_at DESC, l.id DESC
LIMIT $2
OFFSET $3
`.trim();

const COUNT_LISTINGS_SQL = `
-- tana:listing.count
SELECT COUNT(*)::int AS total
FROM listings
WHERE city = $1
`.trim();

export { LISTING_PAGE_SIZE, CITY_MAX_LENGTH, SEARCH_LISTINGS_SQL, COUNT_LISTINGS_SQL };