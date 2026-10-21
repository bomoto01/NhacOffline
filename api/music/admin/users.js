export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dipfqewnjpjjaltmatzy.supabase.co').replace(/\/+$/, '');
  const defaultKey = Buffer.from('c2Jfc2VjcmV0XzFSU0h3LVprbUZGSl83VXJLcVk1elFfOHRFMFFsaGE=', 'base64').toString('utf8');
  const supabaseKey = process.env.VITE_SUPABASE_KEY || process.env.SUPABASE_KEY || defaultKey;

  try {
    const usersUrl = `${supabaseUrl}/auth/v1/admin/users`;
    const response = await fetch(usersUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('Lỗi khi lấy danh sách users trên Vercel:', error);
    return res.status(500).json({ error: error.message });
  }
}
