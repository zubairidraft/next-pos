export interface SystemStatusDto {
  app_name: string;
  pos_core_version: string;
  offline_ready: boolean;
  database: {
    encrypted: boolean;
    journal_mode: string;
    foreign_keys: boolean;
    schema_version: string;
    tables_count: number;
  };
  sample_currency: {
    paisa: number;
    formatted: string;
  };
}
