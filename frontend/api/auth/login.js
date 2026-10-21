export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: 'Email và mật khẩu không được để trống' });
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dipfqewnjpjjaltmatzy.supabase.co').replace(/\/+$/, '');
  const supabaseKey = process.env.VITE_SUPABASE_KEY || process.env.SUPABASE_KEY;

  try {
    const tokenUrl = `${supabaseUrl}/auth/v1/token?grant_type=password`;
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email.trim(),
        password: password,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data.msg || data.error_description || data.message || 'Email hoặc mật khẩu không chính xác.';
      return res.status(response.status).json({ message: errorMsg, ...data });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('Lỗi API Login trên Vercel Serverless:', error);
    return res.status(500).json({ message: 'Lỗi máy chủ khi đăng nhập: ' + error.message });
  }
}
