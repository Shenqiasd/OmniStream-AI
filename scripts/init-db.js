#!/usr/bin/env node
const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGO_DB || 'aitoearn';

const collections = [
  { name: 'user', indexes: [{ key: { mail: 1 }, unique: false }, { key: { isDelete: 1 } }] },
  { name: 'account', indexes: [{ key: { userId: 1 } }, { key: { type: 1 } }, { key: { uid: 1 } }, { key: { type: 1, uid: 1 }, unique: true }, { key: { status: 1 } }] },
  { name: 'publishTask', indexes: [{ key: { publishTime: 1 } }] },
  { name: 'accountGroup', indexes: [] },
  { name: 'aiLog', indexes: [] },
  { name: 'apiKey', indexes: [] },
  { name: 'apiKeyAccount', indexes: [] },
  { name: 'appConfig', indexes: [] },
  { name: 'blog', indexes: [] },
  { name: 'feedback', indexes: [] },
  { name: 'material', indexes: [] },
  { name: 'materialGroup', indexes: [] },
  { name: 'materialTask', indexes: [] },
  { name: 'media', indexes: [] },
  { name: 'mediaGroup', indexes: [] },
  { name: 'notification', indexes: [] },
  { name: 'oauth2Credential', indexes: [] },
  { name: 'pointsRecord', indexes: [] },
  { name: 'publishDayInfo', indexes: [] },
  { name: 'publishInfo', indexes: [] },
  { name: 'publishRecord', indexes: [] },
];

async function initDB() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db(DB_NAME);
    const existingCollections = await db.listCollections().toArray();
    const existingNames = existingCollections.map(c => c.name);

    for (const col of collections) {
      if (!existingNames.includes(col.name)) {
        await db.createCollection(col.name);
        console.log(`✓ Created collection: ${col.name}`);
      } else {
        console.log(`- Collection exists: ${col.name}`);
      }

      if (col.indexes.length > 0) {
        await db.collection(col.name).createIndexes(col.indexes);
        console.log(`✓ Created ${col.indexes.length} index(es) for ${col.name}`);
      }
    }

    console.log('\n✓ Database initialization complete');
  } catch (error) {
    console.error('✗ Initialization failed:', error.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

initDB();
