import defaultTracks from './defaultTracks.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // Cache response for 10 seconds on Vercel Edge Cache, stale-while-revalidate for 60 seconds
  res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=60');
  return res.status(200).json(defaultTracks || []);
}
