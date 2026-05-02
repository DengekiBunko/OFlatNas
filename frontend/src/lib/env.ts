export const isVercelEnv = import.meta.env.VERCEL === "1" ||
    typeof window !== "undefined" &&
    window.location.hostname.includes("vercel.app");

export const isSupabaseConfigured = Boolean(
    import.meta.env.VITE_SUPABASE_URL &&
    import.meta.env.VITE_SUPABASE_ANON_KEY &&
    !import.meta.env.VITE_SUPABASE_URL.includes("placeholder")
);

export const isDockerEnv = typeof window !== "undefined" &&
    window.location.hostname === "localhost" &&
    !import.meta.env.DEV;
