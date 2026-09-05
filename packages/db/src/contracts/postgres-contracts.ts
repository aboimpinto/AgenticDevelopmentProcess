export interface PostgresDatabaseTarget {
  databaseName: string;
  maintenanceConnectionString: string;
}

export interface EnsurePostgresDatabaseResult extends PostgresDatabaseTarget {
  created: boolean;
}
