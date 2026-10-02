"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

/** Logger ud og sender brugeren til `redirectTo` med en fuld sideindlæsning. */
export function LogoutButton({ label, redirectTo }: { label: string; redirectTo: string }) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      loading={pending}
      onClick={async () => {
        setPending(true);
        await authClient.signOut();
        window.location.assign(redirectTo);
      }}
    >
      <LogOut className="size-4" aria-hidden />
      {label}
    </Button>
  );
}
