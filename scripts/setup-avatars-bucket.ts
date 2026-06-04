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
  const bucket = 'avatars';

  const { data: existing } = await admin.storage.getBucket(bucket);
  if (existing) {
    console.log(`Bucket "${bucket}" already exists. Ensuring it's public…`);
    const { error } = await admin.storage.updateBucket(bucket, { public: true });
    if (error) throw error;
    console.log('✅ Bucket is public.');
    return;
  }

  const { error } = await admin.storage.createBucket(bucket, {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024, // 5 MB
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
  });
  if (error) throw error;
  console.log(`✅ Created public bucket "${bucket}".`);
}

main().catch(err => {
  console.error('❌ Failed:', err.message ?? err);
  process.exit(1);
});
