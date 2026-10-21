export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: 'Email và mật khẩu không được để trống' });
  }

  if (password.trim().length < 6) {
    return res.status(400).json({ message: 'Mật khẩu phải có ít nhất 6 ký tự' });
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dipfqewnjpjjaltmatzy.supabase.co').replace(/\/+$/, '');
  const supabaseKey = process.env.VITE_SUPABASE_KEY || process.env.SUPABASE_KEY;

  try {
    // 1. Tạo user bằng Admin API với email_confirm: true (dùng Service Role Key)
    const adminUserUrl = `${supabaseUrl}/auth/v1/admin/users`;
    const createRes = await fetch(adminUserUrl, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email.trim(),
        password: password,
        email_confirm: true,
        user_metadata: {
          role: 'member',
          registered_at: new Date().toISOString(),
        },
      }),
    });

    const createData = await createRes.json();

    if (!createRes.ok) {
      const msg = createData.msg || createData.message || createData.error_description || 'Đăng ký tài khoản thất bại.';
      if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('exists')) {
        return res.status(400).json({ message: 'Email này đã được sử dụng. Vui lòng đăng nhập.' });
      }
      return res.status(createRes.status).json({ message: msg });
    }

    // 2. Tự động lấy access token đăng nhập cho người dùng
    try {
      const tokenUrl = `${supabaseUrl}/auth/v1/token?grant_type=password`;
      const tokenRes = await fetch(tokenUrl, {
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
      const tokenData = await tokenRes.json();
      if (tokenRes.ok) {
        return res.status(200).json(tokenData);
      }
    } catch (tokenErr) {
      console.warn('Không thể cấp token tự động sau khi tạo user:', tokenErr);
    }

    return res.status(200).json({
      message: 'Đăng ký tài khoản thành công',
      user: createData,
    });
  } catch (error) {
    console.error('Lỗi API Signup trên Vercel Serverless:', error);
    return res.status(500).json({ message: 'Lỗi máy chủ khi đăng ký: ' + error.message });
  }
}
