import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not configured. Hot news and user data will not be available.');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);

export interface HotNewsItem {
  id: string;
  source: 'weibo' | 'news' | 'zhihu' | 'bilibili';
  title: string;
  url: string;
  hot_value: string;
  fetched_at: string;
  created_at: string;
}

export interface User {
  id: string;
  username: string;
  is_admin: boolean;
  created_at: string;
}

export interface UserData {
  id: string;
  user_id: string;
  data_key: string;
  data_value: Record<string, unknown>;
}

export const hotNewsApi = {
  async getHotNews(source?: string, limit = 50): Promise<HotNewsItem[]> {
    let query = supabase
      .from('hot_news')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (source) {
      query = query.eq('source', source);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching hot news:', error);
      return [];
    }

    return data || [];
  },

  async getLatestBySource(): Promise<Record<string, HotNewsItem[]>> {
    const sources = ['weibo', 'news', 'zhihu', 'bilibili'];
    const result: Record<string, HotNewsItem[]> = {};

    for (const source of sources) {
      const { data, error } = await supabase
        .from('hot_news')
        .select('*')
        .eq('source', source)
        .order('created_at', { ascending: false })
        .limit(30);

      if (!error && data) {
        result[source] = data;
      } else {
        result[source] = [];
      }
    }

    return result;
  },
};

export const userApi = {
  async register(username: string, password: string): Promise<boolean> {
    const { error } = await supabase.auth.signUp({
      email: `${username}@flatnas.local`,
      password,
    });

    if (error) {
      console.error('Registration error:', error);
      throw new Error(error.message);
    }

    return true;
  },

  async login(username: string, password: string): Promise<boolean> {
    const { error } = await supabase.auth.signInWithPassword({
      email: `${username}@flatnas.local`,
      password,
    });

    if (error) {
      console.error('Login error:', error);
      throw new Error(error.message);
    }

    return true;
  },

  async logout(): Promise<void> {
    await supabase.auth.signOut();
  },

  async getCurrentUser(): Promise<User | null> {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.user) return null;

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', sessionData.session.user.email?.split('@')[0])
      .single();

    if (error) {
      return null;
    }

    return data;
  },

  async isAdmin(): Promise<boolean> {
    const user = await this.getCurrentUser();
    return user?.is_admin || false;
  },
};

export const userDataApi = {
  async saveData(key: string, value: Record<string, unknown>): Promise<boolean> {
    const user = await userApi.getCurrentUser();
    if (!user) {
      throw new Error('User not logged in');
    }

    const { error } = await supabase
      .from('user_data')
      .upsert({
        user_id: user.id,
        data_key: key,
        data_value: value,
      }, {
        onConflict: 'user_id,data_key',
      });

    if (error) {
      console.error('Error saving user data:', error);
      throw new Error(error.message);
    }

    return true;
  },

  async loadData(key: string): Promise<Record<string, unknown> | null> {
    const user = await userApi.getCurrentUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('user_data')
      .select('data_value')
      .eq('user_id', user.id)
      .eq('data_key', key)
      .single();

    if (error) {
      return null;
    }

    return data?.data_value || null;
  },

  async getAllUserData(): Promise<Record<string, Record<string, unknown>>> {
    const user = await userApi.getCurrentUser();
    if (!user) return {};

    const { data, error } = await supabase
      .from('user_data')
      .select('data_key, data_value')
      .eq('user_id', user.id);

    if (error) {
      console.error('Error loading all user data:', error);
      return {};
    }

    const result: Record<string, Record<string, unknown>> = {};
    for (const item of data || []) {
      result[item.data_key] = item.data_value;
    }

    return result;
  },

  subscribeToUserData(
    callback: (data: Record<string, Record<string, unknown>>) => void
  ): { unsubscribe: () => void } {
    let channel: any = null;

    const setupSubscription = async () => {
      const user = await userApi.getCurrentUser();
      if (!user) return;

      channel = supabase
        .channel('user_data_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_data',
            filter: `user_id=eq.${user.id}`,
          },
          async () => {
            const data = await userDataApi.getAllUserData();
            callback(data);
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('Realtime subscription established for user_data');
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            console.warn('Realtime subscription closed or errored, will retry');
          }
        });
    };

    setupSubscription();

    return {
      unsubscribe: () => {
        if (channel) {
          supabase.removeChannel(channel);
          channel = null;
        }
      },
    };
  },
};

export const adminApi = {
  async getAllUsers(): Promise<User[]> {
    const isAdmin = await userApi.isAdmin();
    if (!isAdmin) {
      throw new Error('Permission denied: admin only');
    }

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching all users:', error);
      throw new Error(error.message);
    }

    return data || [];
  },

  async deleteUser(username: string): Promise<boolean> {
    const isAdmin = await userApi.isAdmin();
    if (!isAdmin) {
      throw new Error('Permission denied: admin only');
    }

    const { error } = await supabase
      .from('users')
      .delete()
      .eq('username', username);

    if (error) {
      console.error('Error deleting user:', error);
      throw new Error(error.message);
    }

    return true;
  },
};

export const rssApi = {
  async addFeed(feedUrl: string, title?: string, category?: string): Promise<boolean> {
    const user = await userApi.getCurrentUser();

    const { error } = await supabase
      .from('rss_feeds')
      .insert({
        user_id: user?.id || null,
        feed_url: feedUrl,
        feed_title: title || 'Untitled',
        feed_category: category,
        is_public: !user,
      });

    if (error) {
      console.error('Error adding RSS feed:', error);
      throw new Error(error.message);
    }

    return true;
  },

  async getFeeds(): Promise<any[]> {
    const user = await userApi.getCurrentUser();

    let query = supabase
      .from('rss_feeds')
      .select('*')
      .order('created_at', { ascending: false });

    if (user) {
      query = query.or(`user_id.eq.${user.id},is_public.eq.true`);
    } else {
      query = query.eq('is_public', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching RSS feeds:', error);
      return [];
    }

    return data || [];
  },
};
