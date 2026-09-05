import type { DatabaseSync } from "node:sqlite";

import type { SqliteMetadataSchema } from "./sqlite-metadata-schema.js";

export type SqliteValue = string | number | null;

export class SqliteQueryContext {
  constructor(
    private readonly database: DatabaseSync,
    private readonly schema: SqliteMetadataSchema,
  ) {}

  ensure() {
    this.schema.ensure();
  }

  get<T>(sql: string, params: SqliteValue[] = []) {
    return (this.database.prepare(sql).get(...params) as T | undefined) ?? null;
  }

  all<T>(sql: string, params: SqliteValue[] = []) {
    return this.database.prepare(sql).all(...params) as T[];
  }

  run(sql: string, params: SqliteValue[] = []) {
    return this.database.prepare(sql).run(...params);
  }

  transaction<T>(operation: () => T): T {
    this.database.exec("begin immediate");
    try {
      const result = operation();
      this.database.exec("commit");
      return result;
    } catch (error) {
      this.database.exec("rollback");
      throw error;
    }
  }
}
