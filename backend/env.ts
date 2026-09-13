import { config } from 'dotenv';
import { resolve } from 'path';

// Keep backend credentials isolated in backend/.env while allowing shared
// application settings to fall back to the repository-level .env file.
config({
  path: [resolve(__dirname, '.env'), resolve(__dirname, '../.env')],
  quiet: true,
});
