import express from 'express';
import { supabase } from '../supabaseClient';

const router = express.Router();

router.get('/session', async (req, res) => {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    res.json({ session });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/callback', async (req, res) => {
  const { access_token, refresh_token } = req.body;
  console.log(req.body);
  try {
    const { data, error } = await supabase.auth.setSession({
      access_token: access_token as string,
      refresh_token: refresh_token as string,
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ session: data.session });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sign-up', async (req, res) => {
  const { email, password } = req.body;

  try {
    const { error, data } = await supabase.auth.signUp({
      email: email.toLowerCase(),
      password,
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }
    res.json({ user: data.user });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sign-in', async (req, res) => {
  const { email, password } = req.body;

  try {
    const { error, data } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase(),
      password,
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }
    res.json({ user: data.user, session: data.session });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sign-out', async (req, res) => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    res.json({ message: 'Signed out successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/reset-password', async (req, res) => {
  const { email } = req.body;

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email);

    if (error) {
      return res.status(400).json({ error: error.message });
    }
    res.json({ message: 'Password reset email sent' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/update-password', async (req, res) => {
  const { newPassword } = req.body;

  try {
    const { error, data } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }
    res.json({ user: data.user, message: 'Password updated successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sign-in-phone', async (req, res) => {
  const { phone } = req.body;

  try {
    const { error, data } = await supabase.auth.signInWithOtp({
      phone,
      options: {
        shouldCreateUser: true,
      },
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }
    res.json({ user: data.user });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/verify-otp', async (req, res) => {
  const { phone, token } = req.body;
  try {
    const { error, data } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: 'sms',
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }
    res.json({ user: data.user, session: data.session });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/update-profile', async (req, res) => {
  const { full_name, profile_image, restaurant_name, is_verified } = req.body;

  try {
    const user = supabase.auth.getUser();
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { error } = await supabase.from('profiles').upsert({
      user_id: (await user).data.user?.id,
      full_name,
      profile_image,
      restaurant_name,
      is_verified,
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }
    res.json({ message: 'Profile updated successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
