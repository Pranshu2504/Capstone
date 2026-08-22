/**
 * Finds garment photos in Supabase Storage that no wardrobe row points at,
 * and optionally deletes them.
 *
 * Orphans appear whenever an object outlives its row: a `User` delete cascades
 * the `WardrobeItem` rows but Storage knows nothing about Postgres, an upload
 * can succeed a moment before the row insert fails, and pointing DATABASE_URL
 * at a different database strands everything at once.
 *
 *   npm run photos:orphans           # report only
 *   npm run photos:orphans -- --delete
 *
 * Dry by default: this deletes user data, so removal is opt-in rather than
 * something you trigger by running the wrong command.
 */

import { env } from '../src/lib/env.js';
import { prisma } from '../src/lib/prisma.js';
import { supabaseAdmin } from '../src/lib/supabaseAdmin.js';

const DELETE = process.argv.includes('--delete');

async function listAllObjects(): Promise<string[]> {
  if (!supabaseAdmin) throw new Error('Supabase is not configured.');

  const paths: string[] = [];

  // Storage lists one directory at a time, and uploads are namespaced by user,
  // so the root listing is the set of user folders rather than files.
  const { data: folders, error } = await supabaseAdmin.storage
    .from(env.wardrobeBucket)
    .list('', { limit: 1000 });
  if (error) throw new Error(`Could not list bucket: ${error.message}`);

  for (const folder of folders ?? []) {
    const { data: files } = await supabaseAdmin.storage
      .from(env.wardrobeBucket)
      .list(folder.name, { limit: 1000 });
    for (const file of files ?? []) paths.push(`${folder.name}/${file.name}`);
  }
  return paths;
}

async function main(): Promise<void> {
  if (!supabaseAdmin) {
    console.error('Supabase is not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const [stored, rows] = await Promise.all([
    listAllObjects(),
    prisma.wardrobeItem.findMany({
      where: { imagePath: { not: null } },
      select: { imagePath: true },
    }),
  ]);

  const referenced = new Set(rows.map((r) => r.imagePath!));
  const orphans = stored.filter((p) => !referenced.has(p));

  console.log(`stored objects : ${stored.length}`);
  console.log(`referenced     : ${referenced.size}`);
  console.log(`orphaned       : ${orphans.length}`);

  // A row pointing at a missing object is the opposite failure and shows as a
  // broken thumbnail, so it is worth naming even though this script cannot fix it.
  const storedSet = new Set(stored);
  const missing = [...referenced].filter((p) => !storedSet.has(p));
  if (missing.length) {
    console.log(`\n${missing.length} row(s) reference an object that is gone:`);
    for (const p of missing) console.log(`  ! ${p}`);
  }

  if (!orphans.length) {
    console.log('\nNothing to purge.');
    return;
  }

  console.log();
  for (const p of orphans) console.log(`  - ${p}`);

  if (!DELETE) {
    console.log('\nDry run. Re-run with --delete to remove these.');
    return;
  }

  const { error } = await supabaseAdmin.storage.from(env.wardrobeBucket).remove(orphans);
  if (error) throw new Error(`Delete failed: ${error.message}`);
  console.log(`\nDeleted ${orphans.length} orphaned object(s).`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
