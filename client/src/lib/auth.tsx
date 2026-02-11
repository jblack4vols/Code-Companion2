import { createContext, useContext, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getQueryFn } from "./queryClient";
import type { User } from "@shared/schema";
import { useLocation } from "wouter";

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();

  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const loginMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/login", { email, password });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setLocation("/");
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setLocation("/login");
    },
  });

  const login = useCallback(
    async (email: string, password: string) => {
      await loginMutation.mutateAsync({ email, password });
    },
    [loginMutation]
  );

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
  }, [logoutMutation]);

  return (
    <AuthContext.Provider value={{ user: user ?? null, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useRequireAuth() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  if (!isLoading && !user) {
    setLocation("/login");
  }
  return { user, isLoading };
}

export function hasPermission(
  role: string,
  action: "view" | "edit" | "create" | "delete" | "manage_users" | "manage_settings",
  entity?: string
): boolean {
  if (role === "OWNER") return true;

  switch (action) {
    case "view":
      return true;
    case "edit":
      if (entity === "physician") return ["DIRECTOR", "MARKETER"].includes(role);
      if (entity === "interaction") return ["DIRECTOR", "MARKETER"].includes(role);
      if (entity === "referral") return ["DIRECTOR", "MARKETER", "FRONT_DESK"].includes(role);
      return ["DIRECTOR"].includes(role);
    case "create":
      if (entity === "referral") return ["DIRECTOR", "MARKETER", "FRONT_DESK"].includes(role);
      if (entity === "interaction") return ["DIRECTOR", "MARKETER"].includes(role);
      return ["DIRECTOR"].includes(role);
    case "delete":
      return ["DIRECTOR"].includes(role);
    case "manage_users":
      return ["DIRECTOR"].includes(role);
    case "manage_settings":
      return false;
  }
}
