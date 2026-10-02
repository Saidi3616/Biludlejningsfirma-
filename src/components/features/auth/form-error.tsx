import { Alert } from "@/components/ui/alert";

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return <Alert tone="danger">{message}</Alert>;
}
