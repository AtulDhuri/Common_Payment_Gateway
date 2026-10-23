// FILE: database/data-source.ts
// PURPOSE: TypeORM CLI data source for migrations and seeds
// DEPENDENCIES: configuration.ts, entities.ts
// PHASE: 2
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadConfig } from '../config/configuration';
import { loadEnvFile } from '../config/load-env';
import { ENTITIES } from './entities';

loadEnvFile();

export default new DataSource({
  type: 'postgres',
  url: loadConfig(process.env, false).databaseUrl,
  ssl: { rejectUnauthorized: false },
  entities: ENTITIES,
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  synchronize: false,
});
