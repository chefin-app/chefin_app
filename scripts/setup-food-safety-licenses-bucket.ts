import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const admin = createClient(url, serviceKey);

async function main() {
  // Food safety licenses are private — only the cook + admins should see them.
  const bucket = 'food-safety-licenses';

  const { data: existing } = await admin.storage.getBucket(bucket);
  if (existing) {
    console.log(`Bucket "${bucket}" already exists. Ensuring it's private…`);
    const { error } = await admin.storage.updateBucket(bucket, { public: false });
    if (error) throw error;
    console.log('✅ Bucket is private.');
    return;
  }

  const { error } = await admin.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'],
  });
  if (error) throw error;
  console.log(`✅ Created private bucket "${bucket}".`);
}

main().catch(err => {
  console.error('❌ Failed:', err.message ?? err);
  process.exit(1);
});
