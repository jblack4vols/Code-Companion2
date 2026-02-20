import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Lock } from "lucide-react";

interface ForcePasswordChangeProps {
  open: boolean;
  onPasswordChanged: () => void;
}

export function ForcePasswordChange({ open, onPasswordChanged }: ForcePasswordChangeProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const validatePassword = (pw: string): string | null => {
    if (pw.length < 8) return "Password must be at least 8 characters";
    if (!/[A-Z]/.test(pw)) return "Must contain an uppercase letter";
    if (!/[a-z]/.test(pw)) return "Must contain a lowercase letter";
    if (!/[0-9]/.test(pw)) return "Must contain a number";
    if (!/[^A-Za-z0-9]/.test(pw)) return "Must contain a special character";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const pwError = validatePassword(newPassword);
    if (pwError) { setError(pwError); return; }
    if (newPassword !== confirmPassword) { setError("Passwords do not match"); return; }
    if (newPassword === currentPassword) { setError("New password must be different from current password"); return; }

    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/change-password", { currentPassword, newPassword });
      if (!res.ok) {
        const data = await res.json();
        setError(data.message || "Failed to change password");
        return;
      }
      toast({ title: "Password changed", description: "Your password has been updated successfully." });
      onPasswordChanged();
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5" />
            Password Change Required
          </DialogTitle>
          <DialogDescription>
            For security, you must change your password before continuing. Choose a strong password with at least 8 characters including uppercase, lowercase, number, and special character.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">Current Password</Label>
            <Input id="current-password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required data-testid="input-current-password" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required data-testid="input-new-password" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required data-testid="input-confirm-password" />
          </div>
          {error && <p className="text-sm text-destructive" data-testid="text-password-error">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading} data-testid="button-change-password">
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Change Password
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
