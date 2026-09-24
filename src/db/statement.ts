const STATEMENT_ID = /--\s*tana:([a-z0-9.-]+)/i;

/**
 * Les requêtes portent un identifiant `-- tana:...`.
 * PostgreSQL ignore ce commentaire. Le simulateur s'en sert pour
 * retrouver la requête sans interpréter le SQL, tout en exigeant
 * que les valeurs passent par les paramètres.
 */
export function statementId(sql: string): string | null {
  const found = STATEMENT_ID.exec(sql);
  const id = found?.[1];
  return id ? id.toLowerCase() : null;
}
