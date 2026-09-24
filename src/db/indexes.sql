-- Recherche paginée par ville : la requête exposée aux pics de campagne.
-- L'ordre correspond au ORDER BY de listing.search.
CREATE INDEX IF NOT EXISTS listings_city_created_at_id_idx
  ON listings (city, created_at DESC, id DESC);

CREATE UNIQUE INDEX IF NOT EXISTS processed_webhook_events_id_idx
  ON processed_webhook_events (id);
