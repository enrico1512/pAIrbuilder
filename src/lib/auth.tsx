import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import i18n from '../i18n';

export type AuthUser = {
  id: string;
  email: string;
  fullName: string | null;
  preferredLanguage?: string | null;
};

export type AuthRestaurant = {
  id: string;
  slug: string;
  name: string;
  cuisineType?: string | null;
  email?: string | null;
  phone?: string | null;
  logoUrl?: string | null;
} | null;

type AuthContextValue = {
  user: AuthUser | null;
  restaurant: AuthRestaurant;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    restaurantName: string;
    email: string;
    password: string;
    fullName?: string;
    captchaToken?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function readError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data?.error || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [restaurant, setRestaurant] = useState<AuthRestaurant>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (!res.ok) {
        setUser(null);
        setRestaurant(null);
        return;
      }
      const data = await res.json();
      setUser(data.user);
      setRestaurant(data.restaurant
        ? {
            id: data.restaurant.id,
            slug: data.restaurant.slug,
            name: data.restaurant.name,
            cuisineType: data.restaurant.cuisineType ?? null,
            email: data.restaurant.email ?? null,
            phone: data.restaurant.phone ?? null,
            logoUrl: data.restaurant.logoUrl ?? null,
          }
        : null);
      // If the user has a saved preferred language and it differs from the
      // current UI language, apply it. This makes the saved DB preference
      // win over localStorage/navigator on login (and on session restore).
      const pref = (data.user?.preferredLanguage as string | undefined)?.toLowerCase().slice(0, 2);
      if (pref && (pref === 'it' || pref === 'en')) {
        const current = (i18n.resolvedLanguage || i18n.language || 'it').split('-')[0];
        if (pref !== current) void i18n.changeLanguage(pref);
      }
    } catch {
      setUser(null);
      setRestaurant(null);
    }
  }, []);

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error(await readError(res));
    await refresh();
  }, [refresh]);

  const register = useCallback(async (data: {
    restaurantName: string;
    email: string;
    password: string;
    fullName?: string;
    captchaToken?: string;
  }) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await readError(res));
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setRestaurant(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, restaurant, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside an <AuthProvider>');
  return ctx;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'ristorante';
}
