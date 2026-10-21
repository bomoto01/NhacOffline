export default function handler(req, res) {
  return res.status(200).json({ status: 'UP', service: 'Vercel Serverless API' });
}
