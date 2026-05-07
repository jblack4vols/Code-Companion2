import { useAuth } from "@/lib/auth";
import NotFound from "@/pages/not-found";

interface RoleGuardProps {
  roles: string[];
  children: React.ReactNode;
}

export function RoleGuard({ roles, children }: RoleGuardProps) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) {
    return <NotFound />;
  }
  return <>{children}</>;
}
