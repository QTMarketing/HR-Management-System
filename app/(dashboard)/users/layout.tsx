import { UsersSectionTabs } from "@/components/users/users-section-tabs";

export default function UsersAreaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <UsersSectionTabs />
      {children}
    </div>
  );
}
