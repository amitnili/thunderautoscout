import { MongoClient, Db } from 'mongodb';

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

function getClientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri || uri === 'mongodb+srv://') {
    return Promise.reject(new Error('MONGODB_URI is not configured'));
  }

  if (process.env.NODE_ENV === 'development') {
    if (!global._mongoClientPromise) {
      const client = new MongoClient(uri);
      global._mongoClientPromise = client.connect().catch((err) => {
        // Don't cache a failed connection — next request will retry
        global._mongoClientPromise = undefined;
        throw err;
      });
    }
    return global._mongoClientPromise;
  }

  const client = new MongoClient(uri);
  return client.connect();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default { then: (...args: any[]) => getClientPromise().then(...args) } as Promise<MongoClient>;

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db('frc-scouting');
}
