import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { AlertCircle, Loader2, Lock, CheckCircle2, ArrowLeft, Mail } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import tristarLogo from "@assets/Jordan_Black_-_Transparent_Bacground_PNG_File.638e6192486320._1770818919661.jpeg";

type View = "login" | "register" | "forgot" | "register-success" | "forgot-success";

export default function LoginPage() {
  const { login } = useAuth();
  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setName("");
    setConfirmPassword("");
    setError("");
    setIsLocked(false);
  };

  const switchView = (v: View) => {
    resetForm();
    setView(v);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLocked(false);
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      const msg = err.message || "Invalid credentials";
      if (msg.includes("locked") || msg.includes("Locked")) {
        setIsLocked(true);
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await apiRequest("POST", "/api/auth/register", { name, email, password });
      setView("register-success");
    } catch (err: any) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiRequest("POST", "/api/auth/forgot-password", { email });
      setView("forgot-success");
    } catch (err: any) {
      setError(err.message || "Failed to send reset email");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src={tristarLogo} alt="Tristar Physical Therapy" className="h-16 w-auto mx-auto mb-4 dark:invert" data-testid="img-login-logo" />
          <h1 className="text-2xl font-bold" data-testid="text-login-title">Tristar 360</h1>
          <p className="text-sm text-muted-foreground mt-1">Referring Provider Relationship Management</p>
        </div>

        {view === "login" && (
          <Card>
            <CardHeader className="pb-4">
              <h2 className="text-lg font-semibold text-center">Sign in to your account</h2>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                {error && (
                  <div className={`flex items-center gap-2 p-3 rounded-md text-sm ${isLocked ? "bg-chart-5/10 text-chart-5" : "bg-destructive/10 text-destructive"}`} data-testid="text-login-error">
                    {isLocked ? <Lock className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    required
                    autoComplete="email"
                    data-testid="input-email"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <button
                      type="button"
                      onClick={() => switchView("forgot")}
                      className="text-xs text-primary hover:underline"
                      data-testid="link-forgot-password"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    required
                    autoComplete="current-password"
                    data-testid="input-password"
                  />
                </div>

                <Button type="submit" className="w-full" disabled={loading} data-testid="button-login">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sign in"}
                </Button>

                <div className="text-center pt-2">
                  <p className="text-sm text-muted-foreground">
                    Don't have an account?{" "}
                    <button
                      type="button"
                      onClick={() => switchView("register")}
                      className="text-primary font-medium hover:underline"
                      data-testid="link-register"
                    >
                      Sign up
                    </button>
                  </p>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {view === "register" && (
          <Card>
            <CardHeader className="pb-4">
              <h2 className="text-lg font-semibold text-center">Create an account</h2>
              <p className="text-xs text-muted-foreground text-center mt-1">Your account will need admin approval before access is granted</p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleRegister} className="space-y-4">
                {error && (
                  <div className="flex items-center gap-2 p-3 rounded-md text-sm bg-destructive/10 text-destructive" data-testid="text-register-error">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="reg-name">Full Name</Label>
                  <Input
                    id="reg-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Smith"
                    required
                    autoComplete="name"
                    data-testid="input-register-name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reg-email">Email</Label>
                  <Input
                    id="reg-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jane@company.com"
                    required
                    autoComplete="email"
                    data-testid="input-register-email"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reg-password">Password</Label>
                  <Input
                    id="reg-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 8 chars, upper/lower/number/special"
                    required
                    autoComplete="new-password"
                    data-testid="input-register-password"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reg-confirm">Confirm Password</Label>
                  <Input
                    id="reg-confirm"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    required
                    autoComplete="new-password"
                    data-testid="input-register-confirm"
                  />
                </div>

                <Button type="submit" className="w-full" disabled={loading} data-testid="button-register">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sign up"}
                </Button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => switchView("login")}
                    className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                    data-testid="link-back-login"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    Back to sign in
                  </button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {view === "register-success" && (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <div className="mx-auto w-12 h-12 rounded-full bg-chart-2/15 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-chart-2" />
                </div>
                <h2 className="text-lg font-semibold">Registration Submitted</h2>
                <p className="text-sm text-muted-foreground">
                  Your account has been created and is pending approval by a super admin. You'll be able to log in once your account is approved.
                </p>
                <Button variant="outline" onClick={() => switchView("login")} className="mt-4" data-testid="button-back-to-login">
                  Back to Sign in
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {view === "forgot" && (
          <Card>
            <CardHeader className="pb-4">
              <h2 className="text-lg font-semibold text-center">Reset your password</h2>
              <p className="text-xs text-muted-foreground text-center mt-1">Enter your email and we'll send you a reset link</p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleForgotPassword} className="space-y-4">
                {error && (
                  <div className="flex items-center gap-2 p-3 rounded-md text-sm bg-destructive/10 text-destructive" data-testid="text-forgot-error">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="forgot-email">Email</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    required
                    autoComplete="email"
                    data-testid="input-forgot-email"
                  />
                </div>

                <Button type="submit" className="w-full" disabled={loading} data-testid="button-forgot-submit">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send Reset Link"}
                </Button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => switchView("login")}
                    className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                    data-testid="link-back-login-forgot"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    Back to sign in
                  </button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {view === "forgot-success" && (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <div className="mx-auto w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center">
                  <Mail className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-lg font-semibold">Check Your Email</h2>
                <p className="text-sm text-muted-foreground">
                  If an account exists with that email, we've sent a password reset link. The link expires in 1 hour.
                </p>
                <Button variant="outline" onClick={() => switchView("login")} className="mt-4" data-testid="button-back-to-login-forgot">
                  Back to Sign in
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
