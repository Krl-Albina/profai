import type { Handler } from '@netlify/functions';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function getPool(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('supabase.com')
      ? { rejectUnauthorized: false }
      : undefined,
  });
}

interface JwtPayload {
  sub: string;
  role: string;
  email: string;
}

function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

function mapRole(dbRole: string): string {
  return dbRole === 'candidate' ? 'seeker' : dbRole;
}

function json(statusCode: number, body: unknown) {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(body) };
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  const url = new URL(event.rawUrl);
  const path = url.pathname.replace(/^\/api/, '') || '/';
  const method = event.httpMethod;

  if (path === '/health') {
    return json(200, { ok: true, service: 'prof-ai-api' });
  }

  const pool = getPool();

  if (!pool) {
    return json(503, {
      error: 'Database not configured. Add DATABASE_URL in Netlify environment variables.',
    });
  }

  try {
    if (path === '/auth/register' && method === 'POST') {
      const body = JSON.parse(event.body || '{}') as Record<string, unknown>;
      const { email, password, fullName, age, role } = body as {
        email: string;
        password: string;
        fullName: string;
        age: number | null;
        role: string;
      };

      if (!email || !password || !fullName || !role) {
        return json(400, { error: 'Missing required fields' });
      }

      const dbRole = role === 'seeker' ? 'candidate' : role;
      const passwordHash = await bcrypt.hash(password, 12);

      const result = await pool.query(
        `INSERT INTO public.app_users
           (email, password_hash, full_name, age, role, profile_snapshot, onboarding_answers)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, email, full_name, role, onboarding_completed`,
        [
          String(email).trim().toLowerCase(),
          passwordHash,
          String(fullName).trim(),
          age ?? null,
          dbRole,
          body.profileSnapshot ?? null,
          body.onboardingAnswers ?? null,
        ]
      );

      const user = result.rows[0] as {
        id: string;
        email: string;
        full_name: string;
        role: string;
        onboarding_completed: boolean;
      };
      const token = signToken({ sub: user.id, role: user.role, email: user.email });

      return json(201, {
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: mapRole(user.role),
          onboardingComplete: user.onboarding_completed,
        },
      });
    }

    if (path === '/auth/login' && method === 'POST') {
      const body = JSON.parse(event.body || '{}') as { email: string; password: string };

      if (!body.email || !body.password) {
        return json(400, { error: 'Email and password required' });
      }

      const result = await pool.query(
        'SELECT id, email, password_hash, full_name, role, onboarding_completed FROM public.app_users WHERE email = $1',
        [body.email.trim().toLowerCase()]
      );

      if (result.rows.length === 0) {
        return json(401, { error: 'Invalid email or password' });
      }

      const user = result.rows[0] as {
        id: string;
        email: string;
        password_hash: string;
        full_name: string;
        role: string;
        onboarding_completed: boolean;
      };
      const valid = await bcrypt.compare(body.password, user.password_hash);

      if (!valid) {
        return json(401, { error: 'Invalid email or password' });
      }

      const token = signToken({ sub: user.id, role: user.role, email: user.email });

      return json(200, {
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: mapRole(user.role),
          onboardingComplete: user.onboarding_completed,
        },
      });
    }

    if (path === '/auth/me' && method === 'GET') {
      const authHeader =
        (event.headers['authorization'] || event.headers['Authorization'] || '').trim();
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

      if (!token) return json(401, { error: 'Unauthorized' });

      const payload = verifyToken(token);
      if (!payload) return json(401, { error: 'Invalid token' });

      const result = await pool.query(
        'SELECT id, email, full_name, role, onboarding_completed FROM public.app_users WHERE id = $1',
        [payload.sub]
      );

      if (result.rows.length === 0) return json(404, { error: 'User not found' });

      const user = result.rows[0] as {
        id: string;
        email: string;
        full_name: string;
        role: string;
        onboarding_completed: boolean;
      };

      return json(200, {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: mapRole(user.role),
          onboardingComplete: user.onboarding_completed,
        },
      });
    }

    if (path === '/auth/onboarding-complete' && method === 'POST') {
      const authHeader =
        (event.headers['authorization'] || event.headers['Authorization'] || '').trim();
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

      if (!token) return json(401, { error: 'Unauthorized' });

      const payload = verifyToken(token);
      if (!payload) return json(401, { error: 'Invalid token' });

      await pool.query(
        'UPDATE public.app_users SET onboarding_completed = true, updated_at = now() WHERE id = $1',
        [payload.sub]
      );

      return json(200, { ok: true, onboardingComplete: true });
    }

    return json(404, { error: 'Not found' });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('unique') || message.includes('duplicate key')) {
      return json(409, { error: 'Email already registered' });
    }
    console.error('API error:', error);
    return json(500, { error: 'Internal server error' });
  } finally {
    await pool.end().catch(() => {});
  }
};
