import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { useStore } from '@/store/useStore';

type Role = 'seeker' | 'employer' | 'super_admin';

interface RoleGuardProps {
  allowedRoles: Role[];
  children: ReactNode;
  redirectTo?: string;
  requireAuth?: boolean;
}

export default function RoleGuard({
  allowedRoles,
  children,
  redirectTo = '/',
}: RoleGuardProps) {
  const [, navigate] = useLocation();
  const { userRole, hasHydrated } = useStore();

  if (!hasHydrated) {
    return null;
  }

  const hasAllowedRole = !!userRole && allowedRoles.includes(userRole as Role);

  useEffect(() => {
    if (!hasAllowedRole) {
      navigate(redirectTo);
    }
  }, [hasAllowedRole, navigate, redirectTo]);

  if (!hasAllowedRole) {
    return null;
  }

  return children;
}
