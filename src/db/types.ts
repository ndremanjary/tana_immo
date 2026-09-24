export type QueryResult<T> = {
  rows: T[];
  rowCount: number;
};

/**
 * Contrat aligné sur un client SQL paramétré (node-postgres).
 * En production, l'implémentation est `pg`. Ici, elle est en mémoire.
 */
export interface Database {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<QueryResult<T>>;

  transaction<T>(run: (tx: Database) => Promise<T>): Promise<T>;
}
